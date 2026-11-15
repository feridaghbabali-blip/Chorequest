// Sample family members, chores and a bit of history so the app looks alive
// on first run. Everything here is flagged is_sample = 1 and can be cleared.
import { run, one, all } from './db.js';
import { newId, now, approveCompletion, parseMember } from './logic.js';
import { addDays, periodKey, weekday } from '../web/src/shared/schedule.js';

const MEMBERS = [
  { key: 'leyla', name: 'Leyla', avatar: '🦄', color: '#FF4FA3', role: 'kid', goal: ['Bicycle', '🚲', 6000], split: { spend: 50, save: 30, give: 20 } },
  { key: 'murad', name: 'Murad', avatar: '🦖', color: '#16C47F', role: 'teen', goal: ['Headphones', '🎧', 4500], split: { spend: 60, save: 30, give: 10 } },
  { key: 'nigar', name: 'Nigar', avatar: '🦊', color: '#FF8A00', role: 'kid', goal: ['Art set', '🎨', 2500], split: { spend: 40, save: 40, give: 20 } },
];

const CHORES = [
  { title: 'Make your bed', icon: '🛏️', price: 50, who: 'leyla', repeat: 'daily' },
  { title: 'Tidy your toys', icon: '🧸', price: 50, who: 'nigar', repeat: 'daily' },
  { title: 'Feed the cat', icon: '🐱', price: 30, who: null, repeat: 'daily' },
  { title: 'Set the table', icon: '🍽️', price: 40, who: 'murad', repeat: 'daily' },
  { title: 'Take out the trash', icon: '🗑️', price: 100, who: 'murad', repeat: 'weekdays', weekdays: [0, 2, 4] },
  { title: 'Water the plants', icon: '🪴', price: 60, who: null, repeat: 'weekly' },
  { title: 'Vacuum the living room', icon: '🧹', price: 150, who: 'murad', repeat: 'weekly' },
  { title: 'Wash the car', icon: '🚗', price: 500, who: null, repeat: 'once', bonus: true },
  { title: 'Clean the balcony', icon: '🧽', price: 400, who: null, repeat: 'once', bonus: true },
];

export async function seedSamples(family, today) {
  const ids = {};
  let i = 0;
  for (const m of MEMBERS) {
    ids[m.key] = newId();
    await run(
      `INSERT INTO members (id, family_id, name, avatar, color, role, jar_split, goal_name, goal_icon, goal_price, is_sample, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      [ids[m.key], family.id, m.name, m.avatar, m.color, m.role, JSON.stringify(m.split), ...m.goal, new Date(Date.now() + ++i).toISOString()],
    );
  }
  const chores = [];
  for (const c of CHORES) {
    const chore = {
      id: newId(),
      ...c,
      assignee_id: c.who ? ids[c.who] : null,
      weekdays: c.weekdays || [],
      start_date: addDays(today, -10),
    };
    chores.push(chore);
    await run(
      `INSERT INTO chores (id, family_id, title, icon, price, assignee_id, repeat, weekdays, start_date, is_bonus, is_sample, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      [chore.id, family.id, c.title, c.icon, c.price, chore.assignee_id, c.repeat, JSON.stringify(chore.weekdays), chore.start_date, c.bonus ? 1 : 0, now()],
    );
  }

  // A few days of history: approved chores build streaks, badges and wallets.
  const byTitle = (t) => chores.find((c) => c.title === t);
  const history = [];
  for (let d = 5; d >= 1; d--) {
    const date = addDays(today, -d);
    history.push(['Make your bed', 'leyla', date]);
    if (d <= 4) history.push(['Tidy your toys', 'nigar', date]);
    if (d % 2) history.push(['Feed the cat', d === 3 ? 'nigar' : 'leyla', date]);
    if (d !== 4) history.push(['Set the table', 'murad', date]);
    if ([0, 2, 4].includes(weekday(date))) history.push(['Take out the trash', 'murad', date]);
  }
  history.push(['Clean the balcony', 'murad', addDays(today, -2)]);
  for (const [title, who, date] of history) {
    const chore = byTitle(title);
    const c = {
      id: newId(),
      chore_id: chore.id,
      member_id: ids[who],
      done_date: date,
      amount: chore.price,
    };
    const period = periodKey(chore, date);
    const res = await run(
      `INSERT OR IGNORE INTO completions (id, family_id, chore_id, member_id, period, done_date, status, amount, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
      [c.id, family.id, c.chore_id, c.member_id, period, date, c.amount, now(), now()],
    );
    if (res.rowsAffected) await approveCompletion(family, c);
  }

  // Today: Murad already finished one and is waiting for approval.
  await run(
    `INSERT INTO completions (id, family_id, chore_id, member_id, period, done_date, status, amount, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'pending',?,?,?)`,
    [newId(), family.id, byTitle('Set the table').id, ids.murad, today, today, 40, now(), now()],
  );

  // An earlier payday for Murad.
  await run(
    `INSERT INTO transactions (id, family_id, member_id, type, amount, label, icon, date, created_at)
     VALUES (?,?,?,'payout',?,'payout','💸',?,?)`,
    [newId(), family.id, ids.murad, 300, addDays(today, -2), new Date(Date.now() - 86400000 * 2).toISOString()],
  );
}

export async function clearSamples(familyId) {
  const sampleMembers = await all(`SELECT id FROM members WHERE family_id = ? AND is_sample = 1`, [familyId]);
  const sampleChores = await all(`SELECT id FROM chores WHERE family_id = ? AND is_sample = 1`, [familyId]);
  for (const { id } of sampleMembers) {
    await run(`DELETE FROM completions WHERE member_id = ?`, [id]);
    await run(`DELETE FROM transactions WHERE member_id = ?`, [id]);
    await run(`DELETE FROM badges WHERE member_id = ?`, [id]);
    await run(`DELETE FROM members WHERE id = ?`, [id]);
  }
  for (const { id } of sampleChores) {
    await run(`DELETE FROM completions WHERE chore_id = ? AND status != 'approved'`, [id]);
    await run(`DELETE FROM chores WHERE id = ?`, [id]);
  }
}

export async function hasSamples(familyId) {
  const r = await one(
    `SELECT (SELECT COUNT(*) FROM members WHERE family_id = ? AND is_sample = 1) +
            (SELECT COUNT(*) FROM chores WHERE family_id = ? AND is_sample = 1) AS n`,
    [familyId, familyId],
  );
  return Number(r.n) > 0;
}

export { parseMember };
