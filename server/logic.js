// Business rules: approving chores, streak bonuses, badges and wallet totals.
import crypto from 'node:crypto';
import { all, one, run } from './db.js';
import { splitJars, runEndingOn, currentStreak, weekStart, addDays } from '../web/src/shared/schedule.js';

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function parseMember(m) {
  return { ...m, jar_split: JSON.parse(m.jar_split) };
}

export function parseChore(c) {
  return { ...c, weekdays: JSON.parse(c.weekdays), active: !!c.active, is_bonus: !!c.is_bonus };
}

async function approvedDates(memberId) {
  const rows = await all(
    `SELECT DISTINCT done_date FROM completions WHERE member_id = ? AND status = 'approved'`,
    [memberId],
  );
  return rows.map((r) => r.done_date);
}

async function addEarning(familyId, member, { type, amount, ref, label, icon, date }) {
  const jars = splitJars(amount, member.jar_split);
  await run(
    `INSERT INTO transactions (id, family_id, member_id, type, amount, spend, save, give, ref, label, icon, date, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId(), familyId, member.id, type, amount, jars.spend, jars.save, jars.give, ref, label, icon, date, now()],
  );
}

// Approve a pending completion: pay the chore, maybe add a streak bonus, check badges.
export async function approveCompletion(family, completion) {
  const chore = await one(`SELECT * FROM chores WHERE id = ?`, [completion.chore_id]);
  const member = parseMember(await one(`SELECT * FROM members WHERE id = ?`, [completion.member_id]));
  await run(`UPDATE completions SET status = 'approved', note = NULL, updated_at = ? WHERE id = ?`, [now(), completion.id]);
  await addEarning(family.id, member, {
    type: 'earning',
    amount: completion.amount,
    ref: 'c:' + completion.id,
    label: chore?.title || '',
    icon: chore?.icon || '✅',
    date: completion.done_date,
  });

  // Streak bonus: every N days in a row (N = family.streak_days)
  const dates = new Set(await approvedDates(member.id));
  const runLen = runEndingOn(dates, completion.done_date);
  if (family.streak_bonus > 0 && runLen > 0 && runLen % family.streak_days === 0) {
    const ref = `streak:${member.id}:${completion.done_date}`;
    const exists = await one(`SELECT id FROM transactions WHERE ref = ?`, [ref]);
    if (!exists) {
      await addEarning(family.id, member, {
        type: 'bonus',
        amount: family.streak_bonus,
        ref,
        label: `streak:${runLen}`,
        icon: '🔥',
        date: completion.done_date,
      });
    }
  }
  await checkBadges(family.id, member.id);
}

function longestRun(dates) {
  const set = new Set(dates);
  let best = 0;
  for (const d of set) {
    if (!set.has(addDays(d, -1))) best = Math.max(best, countForward(set, d));
  }
  return best;
}
function countForward(set, d) {
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, 1);
  }
  return n;
}

export async function checkBadges(familyId, memberId) {
  const member = parseMember(await one(`SELECT * FROM members WHERE id = ?`, [memberId]));
  const c = await one(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN ch.is_bonus = 1 THEN 1 ELSE 0 END) AS bonus
       FROM completions co LEFT JOIN chores ch ON ch.id = co.chore_id
      WHERE co.member_id = ? AND co.status = 'approved'`,
    [memberId],
  );
  const jars = await one(
    `SELECT COALESCE(SUM(save),0) AS save, COALESCE(SUM(give),0) AS give
       FROM transactions WHERE member_id = ? AND type IN ('earning','bonus')`,
    [memberId],
  );
  const best = longestRun(await approvedDates(memberId));
  const earned = [];
  const n = Number(c.n);
  if (n >= 1) earned.push('first_chore');
  if (n >= 10) earned.push('ten_chores');
  if (n >= 50) earned.push('fifty_chores');
  if (best >= 3) earned.push('streak_3');
  if (best >= 7) earned.push('streak_7');
  if (Number(c.bonus) >= 1) earned.push('bonus_hero');
  if (jars.save >= 1000) earned.push('saver');
  if (jars.give >= 500) earned.push('giver');
  if (member.goal_price && jars.save >= member.goal_price) earned.push('goal_reached');
  for (const b of earned) {
    await run(`INSERT OR IGNORE INTO badges (member_id, family_id, badge, earned_at) VALUES (?,?,?,?)`, [
      memberId,
      familyId,
      b,
      now(),
    ]);
  }
}

// Everything the app needs to draw the screens, in one payload.
export async function familyState(family, today) {
  const members = (await all(`SELECT * FROM members WHERE family_id = ? ORDER BY created_at`, [family.id])).map(
    parseMember,
  );
  const chores = (await all(`SELECT * FROM chores WHERE family_id = ? ORDER BY created_at`, [family.id])).map(
    parseChore,
  );
  const since = addDays(today, -60);
  const completions = await all(
    `SELECT id, chore_id, member_id, period, done_date, status, note, amount, updated_at,
            CASE WHEN photo IS NULL THEN 0 ELSE 1 END AS has_photo
       FROM completions
      WHERE family_id = ? AND (status != 'approved' OR period = 'once' OR done_date >= ?)
      ORDER BY updated_at DESC`,
    [family.id, since],
  );
  const transactions = await all(
    `SELECT * FROM transactions WHERE family_id = ? ORDER BY created_at DESC LIMIT 500`,
    [family.id],
  );
  const totals = await all(
    `SELECT member_id,
            SUM(CASE WHEN type IN ('earning','bonus') THEN amount ELSE 0 END) AS earned,
            SUM(CASE WHEN type = 'payout' THEN amount ELSE 0 END) AS paid,
            SUM(spend) AS spend, SUM(save) AS save, SUM(give) AS give,
            SUM(CASE WHEN type IN ('earning','bonus') AND date >= ? THEN amount ELSE 0 END) AS week_earned
       FROM transactions WHERE family_id = ? GROUP BY member_id`,
    [weekStart(today), family.id],
  );
  const counts = await all(
    `SELECT co.member_id, COUNT(*) AS n,
            SUM(CASE WHEN co.done_date >= ? THEN 1 ELSE 0 END) AS week_n,
            SUM(CASE WHEN ch.is_bonus = 1 THEN 1 ELSE 0 END) AS bonus_n
       FROM completions co LEFT JOIN chores ch ON ch.id = co.chore_id
      WHERE co.family_id = ? AND co.status = 'approved' GROUP BY co.member_id`,
    [weekStart(today), family.id],
  );
  const dates = await all(
    `SELECT DISTINCT member_id, done_date FROM completions WHERE family_id = ? AND status = 'approved' AND done_date >= ?`,
    [family.id, addDays(today, -400)],
  );
  const badges = await all(`SELECT member_id, badge, earned_at FROM badges WHERE family_id = ?`, [family.id]);

  for (const m of members) {
    const t = totals.find((x) => x.member_id === m.id) || {};
    const c = counts.find((x) => x.member_id === m.id) || {};
    const earned = Number(t.earned || 0);
    const paid = Number(t.paid || 0);
    const n = Number(c.n || 0);
    m.stats = {
      earned,
      paid,
      owed: earned - paid,
      spend: Number(t.spend || 0),
      save: Number(t.save || 0),
      give: Number(t.give || 0),
      weekEarned: Number(t.week_earned || 0),
      approved: n,
      weekCount: Number(c.week_n || 0),
      xp: n * 10 + Number(c.bonus_n || 0) * 20,
      streak: currentStreak(
        dates.filter((d) => d.member_id === m.id).map((d) => d.done_date),
        today,
      ),
    };
    m.badges = badges.filter((b) => b.member_id === m.id).map(({ badge, earned_at }) => ({ badge, earned_at }));
  }

  return {
    family: {
      id: family.id,
      name: family.name,
      code: family.code,
      currency: family.currency,
      streak_days: family.streak_days,
      streak_bonus: family.streak_bonus,
    },
    members,
    chores,
    completions,
    transactions,
  };
}
