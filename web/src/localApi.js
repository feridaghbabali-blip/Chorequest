// "Server" for the claude.ai artifact build: the same routes as server/index.js,
// but running in the browser on top of the artifact's shared `db` store.
// Each family = one artifact. Collections: members, chores, completions,
// transactions, badges; plus the document config/family.
import { isDueOn, periodKey, splitJars, runEndingOn, currentStreak, weekStart, addDays, weekday } from './shared/schedule.js';
import { MEMBERS, CHORES } from './shared/sampleData.js';

const COLLECTIONS = ['members', 'chores', 'completions', 'transactions', 'badges'];
const cache = { family: undefined, members: [], chores: [], completions: [], transactions: [], badges: [] };
let db = null;
let ready = false;
const listeners = new Set();

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const fail = (code) => {
  throw new Error(code);
};
const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
const clean = (s, max = 60) => String(s ?? '').trim().slice(0, max);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : new Date().toISOString().slice(0, 10));

async function hashPin(pin, salt = Math.random().toString(36).slice(2, 10)) {
  const text = salt + ':' + pin;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return salt + ':' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; // fallback where SubtleCrypto is missing (non-https)
  for (let i = 0; i < 2000; i++) for (const ch of text + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return salt + ':f' + h.toString(16);
}

function emit() {
  for (const fn of listeners) fn();
}

// ---------- connect ----------
// Resolves 'ready' | 'no_db' | 'timeout'
export function connect() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 12000);
    (async () => {
      db = await window.claude?.use?.('db');
      if (!db) {
        clearTimeout(timer);
        return resolve('no_db');
      }
      const pending = new Set([...COLLECTIONS, 'family']);
      const arrived = (k) => {
        pending.delete(k);
        if (!pending.size && !ready) {
          ready = true;
          clearTimeout(timer);
          resolve('ready');
        }
        if (ready) emit();
      };
      db.doc('config/family').onSnapshot(
        (s) => {
          cache.family = s.exists ? { id: 'family', ...s.data() } : null;
          arrived('family');
        },
        () => {},
      );
      for (const c of COLLECTIONS) {
        db.collection(c).onSnapshot(
          (snap) => {
            cache[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            arrived(c);
          },
          () => {},
        );
      }
    })().catch(() => resolve('no_db'));
  });
}

export const onChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
// A family only counts once it has at least one member (an interrupted setup leaves none).
export const hasFamily = () => !!cache.family && cache.members.length > 0;
export const photoOf = (id) => cache.completions.find((c) => c.id === id)?.photo || null;

// ---------- helpers ----------
const coll = (c) => db.collection(c);
const member = (id) => cache.members.find((m) => m.id === id) || fail('member_not_found');
const chore = (id) => cache.chores.find((c) => c.id === id) || fail('chore_not_found');
const completion = (id) => cache.completions.find((c) => c.id === id) || fail('not_found');
const isParent = (h) => !!cache.family && h['x-parent-token'] === cache.family.pin_hash;

async function addTx(m, { type, amount, id, label, icon, date }) {
  const jars = type === 'payout' ? { spend: 0, save: 0, give: 0 } : splitJars(amount, m.jar_split);
  const tx = { member_id: m.id, type, amount, ...jars, label, icon, date, created_at: now() };
  await coll('transactions').doc(id || newId()).set(tx);
  cache.transactions.push({ id: id || 'tmp', ...tx });
}

function approvedDates(memberId) {
  return [...new Set(cache.completions.filter((c) => c.member_id === memberId && c.status === 'approved').map((c) => c.done_date))];
}

async function approve(c) {
  const ch = cache.chores.find((x) => x.id === c.chore_id);
  const m = member(c.member_id);
  await coll('completions').doc(c.id).update({ status: 'approved', note: null, updated_at: now() });
  c.status = 'approved';
  await addTx(m, { type: 'earning', amount: c.amount, id: 'c_' + c.id, label: ch?.title || '', icon: ch?.icon || '✅', date: c.done_date });
  const f = cache.family;
  const runLen = runEndingOn(new Set(approvedDates(m.id)), c.done_date);
  if (f.streak_bonus > 0 && runLen > 0 && runLen % f.streak_days === 0) {
    await addTx(m, { type: 'bonus', amount: f.streak_bonus, id: `streak_${m.id}_${c.done_date}`, label: `streak:${runLen}`, icon: '🔥', date: c.done_date });
  }
  await checkBadges(m.id);
}

function longestRun(dates) {
  const set = new Set(dates);
  let best = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue;
    let n = 0;
    let x = d;
    while (set.has(x)) {
      n++;
      x = addDays(x, 1);
    }
    best = Math.max(best, n);
  }
  return best;
}

async function checkBadges(memberId) {
  const m = member(memberId);
  const done = cache.completions.filter((c) => c.member_id === memberId && c.status === 'approved');
  const bonus = done.filter((c) => cache.chores.find((x) => x.id === c.chore_id)?.is_bonus).length;
  const tx = cache.transactions.filter((t) => t.member_id === memberId && t.type !== 'payout');
  const save = tx.reduce((s, t) => s + (t.save || 0), 0);
  const give = tx.reduce((s, t) => s + (t.give || 0), 0);
  const best = longestRun(approvedDates(memberId));
  const earned = [];
  if (done.length >= 1) earned.push('first_chore');
  if (done.length >= 10) earned.push('ten_chores');
  if (done.length >= 50) earned.push('fifty_chores');
  if (best >= 3) earned.push('streak_3');
  if (best >= 7) earned.push('streak_7');
  if (bonus >= 1) earned.push('bonus_hero');
  if (save >= 1000) earned.push('saver');
  if (give >= 500) earned.push('giver');
  if (m.goal_price && save >= m.goal_price) earned.push('goal_reached');
  for (const b of earned) {
    const id = `${memberId}_${b}`;
    if (cache.badges.some((x) => x.id === id)) continue;
    const doc = { member_id: memberId, badge: b, earned_at: now() };
    await coll('badges').doc(id).set(doc);
    cache.badges.push({ id, ...doc });
  }
}

// ---------- state (same shape as the server's /api/state) ----------
function state(today, headers) {
  const f = cache.family;
  const ws = weekStart(today);
  const members = [...cache.members]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map((m) => {
      const tx = cache.transactions.filter((t) => t.member_id === m.id);
      const sum = (fn) => tx.reduce((s, t) => s + fn(t), 0);
      const earned = sum((t) => (t.type !== 'payout' ? t.amount : 0));
      const paid = sum((t) => (t.type === 'payout' ? t.amount : 0));
      const done = cache.completions.filter((c) => c.member_id === m.id && c.status === 'approved');
      const bonusN = done.filter((c) => cache.chores.find((x) => x.id === c.chore_id)?.is_bonus).length;
      return {
        ...m,
        stats: {
          earned,
          paid,
          owed: earned - paid,
          spend: sum((t) => t.spend || 0),
          save: sum((t) => t.save || 0),
          give: sum((t) => t.give || 0),
          weekEarned: sum((t) => (t.type !== 'payout' && t.date >= ws ? t.amount : 0)),
          approved: done.length,
          weekCount: done.filter((c) => c.done_date >= ws).length,
          xp: done.length * 10 + bonusN * 20,
          streak: currentStreak(approvedDates(m.id), today),
        },
        badges: cache.badges.filter((b) => b.member_id === m.id).map(({ badge, earned_at }) => ({ badge, earned_at })),
      };
    });
  return {
    family: { id: 'family', name: f.name, code: f.code, currency: f.currency, streak_days: f.streak_days, streak_bonus: f.streak_bonus },
    members,
    chores: [...cache.chores].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    completions: cache.completions
      .map(({ photo, ...c }) => ({ ...c, has_photo: photo ? 1 : 0 }))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
    transactions: [...cache.transactions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    hasSamples: cache.members.some((m) => m.is_sample) || cache.chores.some((c) => c.is_sample),
    isParent: isParent(headers),
  };
}

// ---------- samples ----------
async function seedSamples(today) {
  const ids = {};
  let i = 0;
  for (const m of MEMBERS) {
    ids[m.key] = newId();
    const doc = {
      name: m.name, avatar: m.avatar, color: m.color, role: m.role, jar_split: m.split,
      goal_name: m.goal[0], goal_icon: m.goal[1], goal_price: m.goal[2], is_sample: true,
      created_at: new Date(Date.now() + ++i).toISOString(),
    };
    await coll('members').doc(ids[m.key]).set(doc);
    cache.members.push({ id: ids[m.key], ...doc });
  }
  const chores = [];
  for (const c of CHORES) {
    const doc = {
      title: c.title, icon: c.icon, price: c.price, assignee_id: c.who ? ids[c.who] : null, repeat: c.repeat,
      weekdays: c.weekdays || [], start_date: addDays(today, -10), is_bonus: !!c.bonus, active: true, is_sample: true, created_at: now(),
    };
    const id = newId();
    await coll('chores').doc(id).set(doc);
    chores.push({ id, ...doc });
    cache.chores.push({ id, ...doc });
  }
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
    const ch = byTitle(title);
    const c = { chore_id: ch.id, member_id: ids[who], period: periodKey(ch, date), done_date: date, status: 'pending', amount: ch.price, created_at: now(), updated_at: now() };
    c.id = `${ch.id}_${c.period}`;
    if (cache.completions.some((x) => x.id === c.id)) continue;
    const { id, ...body } = c;
    await coll('completions').doc(id).set(body);
    cache.completions.push(c);
    await approve(c);
  }
  const st = byTitle('Set the table');
  const pend = { chore_id: st.id, member_id: ids.murad, period: today, done_date: today, status: 'pending', amount: 40, created_at: now(), updated_at: now() };
  await coll('completions').doc(`${st.id}_${today}`).set(pend);
  await addTx(cache.members.find((m) => m.id === ids.murad), { type: 'payout', amount: 300, label: 'payout', icon: '💸', date: addDays(today, -2) });
}

async function clearSamples() {
  const sm = cache.members.filter((m) => m.is_sample).map((m) => m.id);
  const sc = cache.chores.filter((c) => c.is_sample).map((c) => c.id);
  for (const c of cache.completions.filter((c) => sm.includes(c.member_id) || (sc.includes(c.chore_id) && c.status !== 'approved'))) await coll('completions').doc(c.id).delete();
  for (const t of cache.transactions.filter((t) => sm.includes(t.member_id))) await coll('transactions').doc(t.id).delete();
  for (const b of cache.badges.filter((b) => sm.includes(b.member_id))) await coll('badges').doc(b.id).delete();
  for (const id of sm) await coll('members').doc(id).delete();
  for (const id of sc) await coll('chores').doc(id).delete();
}

// ---------- routes ----------
function choreFields(b, old = {}) {
  const repeat = ['once', 'daily', 'weekly', 'weekdays'].includes(b.repeat) ? b.repeat : old.repeat || 'daily';
  const weekdays = Array.isArray(b.weekdays) ? b.weekdays.filter((d) => d >= 0 && d <= 6) : old.weekdays || [];
  if (repeat === 'weekdays' && !weekdays.length) fail('pick_days');
  const title = b.title !== undefined ? clean(b.title) : old.title;
  if (!title) fail('missing_name');
  return {
    title,
    icon: clean(b.icon ?? old.icon, 8) || '⭐',
    price: b.price !== undefined ? cents(b.price) : old.price,
    assignee_id: b.assignee_id !== undefined ? b.assignee_id || null : old.assignee_id ?? null,
    repeat,
    weekdays,
    start_date: b.start_date ? validDate(b.start_date) : old.start_date || validDate(),
    is_bonus: b.is_bonus !== undefined ? !!b.is_bonus : !!old.is_bonus,
    active: b.active !== undefined ? !!b.active : old.active ?? true,
  };
}

async function handle(method, path, body = {}, headers = {}) {
  const [route, query] = path.split('?');
  const p = route.split('/').filter(Boolean);
  const parent = () => isParent(headers) || fail('parent_only');
  const done = () => {
    emit();
    return { ok: true };
  };

  if (method === 'POST' && route === '/families') {
    if (hasFamily()) fail('family_exists');
    if (!clean(body.name) || !clean(body.parentName)) fail('missing_name');
    if (!/^\d{4,6}$/.test(String(body.pin || ''))) fail('bad_pin');
    const pin_hash = await hashPin(body.pin);
    const fam = { name: clean(body.name), code: 'LINK', currency: clean(body.currency, 5) || 'AZN', streak_days: 3, streak_bonus: 50, pin_hash, created_at: now() };
    // Save the first member before the family document, so a setup that stops halfway never looks finished.
    const memberId = newId();
    const m = { name: clean(body.parentName, 30), avatar: clean(body.avatar, 8) || '🦁', color: COLOR.test(body.color) ? body.color : '#7C4DFF', role: 'parent', jar_split: { spend: 50, save: 30, give: 20 }, created_at: now() };
    await coll('members').doc(memberId).set(m);
    cache.members.push({ id: memberId, ...m });
    await db.doc('config/family').set(fam);
    cache.family = { id: 'family', ...fam };
    if (body.withSamples) await seedSamples(validDate(body.date));
    emit();
    return { token: 'artifact', code: 'LINK', memberId, parentToken: pin_hash };
  }
  if (!hasFamily()) fail('no_family');

  if (method === 'GET' && route === '/state') return state(validDate(new URLSearchParams(query).get('date')), headers);

  if (method === 'POST' && route === '/parent/unlock') {
    const [salt] = cache.family.pin_hash.split(':');
    if ((await hashPin(String(body.pin || ''), salt)) !== cache.family.pin_hash) fail('wrong_pin');
    return { parentToken: cache.family.pin_hash };
  }
  if (method === 'PATCH' && route === '/family') {
    parent();
    const f = cache.family;
    const upd = {
      name: body.name !== undefined ? clean(body.name) || f.name : f.name,
      currency: body.currency ? clean(body.currency, 5) : f.currency,
      streak_days: body.streak_days ? Math.min(30, Math.max(2, Number(body.streak_days) | 0)) : f.streak_days,
      streak_bonus: body.streak_bonus !== undefined ? cents(body.streak_bonus) : f.streak_bonus,
    };
    if (body.pin) {
      if (!/^\d{4,6}$/.test(String(body.pin))) fail('bad_pin');
      upd.pin_hash = await hashPin(body.pin);
    }
    await db.doc('config/family').update(upd);
    Object.assign(cache.family, upd);
    emit();
    return { parentToken: cache.family.pin_hash };
  }
  if (method === 'POST' && route === '/samples/clear') {
    parent();
    await clearSamples();
    return done();
  }

  // members
  if (p[0] === 'members') {
    if (method === 'POST' && p.length === 1) {
      parent();
      if (!clean(body.name)) fail('missing_name');
      const id = newId();
      const m = {
        name: clean(body.name, 30), avatar: clean(body.avatar, 8) || '🐼', color: COLOR.test(body.color) ? body.color : '#2E9BFF',
        role: ['parent', 'adult', 'teen', 'kid'].includes(body.role) ? body.role : 'kid', jar_split: { spend: 50, save: 30, give: 20 }, created_at: now(),
      };
      await coll('members').doc(id).set(m);
      cache.members.push({ id, ...m });
      emit();
      return { id };
    }
    const m = member(p[1]);
    if (method === 'PATCH') {
      const upd = {};
      if (body.avatar) upd.avatar = clean(body.avatar, 8);
      if (COLOR.test(body.color || '')) upd.color = body.color;
      if (body.goal_name !== undefined) upd.goal_name = clean(body.goal_name, 40) || null;
      if (body.goal_icon !== undefined) upd.goal_icon = clean(body.goal_icon, 8) || null;
      if (body.goal_price !== undefined) upd.goal_price = cents(body.goal_price) || null;
      if (body.jar_split) {
        const s = { spend: cents(body.jar_split.spend), save: cents(body.jar_split.save), give: cents(body.jar_split.give) };
        if (s.spend + s.save + s.give !== 100) fail('split_must_be_100');
        upd.jar_split = s;
      }
      if (isParent(headers)) {
        if (body.name) upd.name = clean(body.name, 30);
        if (['parent', 'adult', 'teen', 'kid'].includes(body.role)) upd.role = body.role;
      }
      await coll('members').doc(m.id).update(upd);
      Object.assign(m, upd);
      await checkBadges(m.id);
      return done();
    }
    if (method === 'DELETE') {
      parent();
      for (const c of cache.completions.filter((c) => c.member_id === m.id)) await coll('completions').doc(c.id).delete();
      for (const t of cache.transactions.filter((t) => t.member_id === m.id)) await coll('transactions').doc(t.id).delete();
      for (const b of cache.badges.filter((b) => b.member_id === m.id)) await coll('badges').doc(b.id).delete();
      for (const c of cache.chores.filter((c) => c.assignee_id === m.id)) await coll('chores').doc(c.id).update({ assignee_id: null });
      await coll('members').doc(m.id).delete();
      return done();
    }
  }

  // chores
  if (p[0] === 'chores') {
    if (method === 'POST' && p.length === 1) {
      parent();
      const c = choreFields(body);
      if (c.assignee_id) member(c.assignee_id);
      const id = newId();
      await coll('chores').doc(id).set({ ...c, created_at: now() });
      cache.chores.push({ id, ...c, created_at: now() });
      emit();
      return { id };
    }
    const ch = chore(p[1]);
    if (method === 'PATCH') {
      parent();
      const c = choreFields(body, ch);
      if (c.assignee_id) member(c.assignee_id);
      await coll('chores').doc(ch.id).update(c);
      Object.assign(ch, c);
      return done();
    }
    if (method === 'DELETE') {
      parent();
      for (const c of cache.completions.filter((c) => c.chore_id === ch.id && c.status !== 'approved')) await coll('completions').doc(c.id).delete();
      await coll('chores').doc(ch.id).delete();
      return done();
    }
    const m = member(body.memberId);
    const date = validDate(body.date);
    if (!isDueOn(ch, date)) fail('not_due');
    const period = periodKey(ch, date);
    const id = `${ch.id}_${period}`;
    const existing = cache.completions.find((c) => c.id === id);
    if (p[2] === 'claim') {
      if (ch.assignee_id) fail('not_open');
      if (existing) fail('already_taken');
      const c = { chore_id: ch.id, member_id: m.id, period, status: 'claimed', amount: ch.price, created_at: now(), updated_at: now() };
      await coll('completions').doc(id).set(c);
      cache.completions.push({ id, ...c });
      return done();
    }
    if (p[2] === 'done') {
      if (ch.assignee_id && ch.assignee_id !== m.id) fail('not_yours');
      let photo = null;
      if (body.photo) {
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(body.photo) || body.photo.length > 200000) fail('bad_photo');
        photo = body.photo;
      }
      if (existing) {
        if (['pending', 'approved'].includes(existing.status)) fail('already_done');
        if (existing.member_id !== m.id) fail('already_taken');
      }
      const c = { chore_id: ch.id, member_id: m.id, period, done_date: date, status: 'pending', note: null, photo, amount: ch.price, created_at: existing?.created_at || now(), updated_at: now() };
      await coll('completions').doc(id).set(c);
      if (existing) Object.assign(existing, c);
      else cache.completions.push({ id, ...c });
      return done();
    }
  }

  // completions
  if (p[0] === 'completions') {
    const c = completion(p[1]);
    if (p[2] === 'undo') {
      if (!['claimed', 'pending'].includes(c.status)) fail('cannot_undo');
      await coll('completions').doc(c.id).delete();
      cache.completions = cache.completions.filter((x) => x.id !== c.id);
      return done();
    }
    if (p[2] === 'approve') {
      parent();
      if (c.status !== 'pending') fail('not_pending');
      await approve(c);
      return done();
    }
    if (p[2] === 'reject') {
      parent();
      if (c.status !== 'pending') fail('not_pending');
      const upd = { status: 'rejected', note: clean(body.note, 140) || null, photo: null, updated_at: now() };
      await coll('completions').doc(c.id).update(upd);
      Object.assign(c, upd);
      return done();
    }
  }

  if (method === 'POST' && route === '/payouts') {
    parent();
    const m = member(body.memberId);
    const owed = cache.transactions.filter((t) => t.member_id === m.id).reduce((s, t) => s + (t.type === 'payout' ? -t.amount : t.amount), 0);
    const amount = body.amount !== undefined ? Math.min(cents(body.amount), owed) : owed;
    if (amount <= 0) fail('nothing_owed');
    await addTx(m, { type: 'payout', amount, label: 'payout', icon: '💸', date: validDate(body.date) });
    emit();
    return { ok: true, amount };
  }
  fail('not_found');
}

export function makeLocalApi(getHeaders) {
  return async (path, { method = 'GET', body } = {}) => {
    if (!db) throw new Error('offline');
    try {
      return await handle(method, path, body, getHeaders());
    } catch (e) {
      if (!(e instanceof Error) || !/^[a-z_]+$/.test(e.message)) console.warn('ChoreQuest:', e);
      // the store refuses writes from people who only have view access
      if (e?.code === 'invalid_argument') throw new Error('read_only');
      if (e?.code) throw new Error('offline');
      throw new Error(e.message || 'generic');
    }
  };
}
