// ChoreQuest API server. Serves the JSON API under /api and the built web app.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate, all, one, run } from './db.js';
import { newId, now, approveCompletion, checkBadges, familyState, parseChore, parseMember } from './logic.js';
import { seedSamples, clearSamples, hasSamples } from './samples.js';
import { isDueOn, periodKey, todayStr } from '../web/src/shared/schedule.js';

const app = express();
app.use(express.json({ limit: '3mb' }));

// ---------- helpers ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const token = () => crypto.randomBytes(24).toString('base64url');

function hashPin(pin) {
  const salt = crypto.randomBytes(8).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
function checkPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}

let SECRET = process.env.APP_SECRET;
async function loadSecret() {
  if (SECRET) return;
  await run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
  const row = await one(`SELECT value FROM meta WHERE key = 'secret'`);
  if (row) SECRET = row.value;
  else {
    SECRET = token();
    await run(`INSERT INTO meta (key, value) VALUES ('secret', ?)`, [SECRET]);
  }
}
const parentToken = (family) => crypto.createHmac('sha256', SECRET).update(family.id + ':' + family.pin_hash).digest('base64url');

const validDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : todayStr());
const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
const clean = (s, max = 60) => String(s ?? '').trim().slice(0, max);
const COLOR = /^#[0-9a-fA-F]{6}$/;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code) => {
  throw new HttpError(status, code);
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- live updates (Server-Sent Events) ----------
const listeners = new Map(); // familyId -> Set(res)
function notify(familyId) {
  for (const res of listeners.get(familyId) || []) res.write(`data: change\n\n`);
}

// ---------- auth middleware ----------
async function familyAuth(req, res, next) {
  try {
    const t = req.get('x-family-token') || req.query.t;
    if (!t) fail(401, 'no_family');
    const family = await one(`SELECT * FROM families WHERE token = ?`, [t]);
    if (!family) fail(401, 'no_family');
    req.family = family;
    req.isParent = req.get('x-parent-token') === parentToken(family);
    next();
  } catch (e) {
    next(e);
  }
}
const parentOnly = (req, res, next) => (req.isParent ? next() : next(new HttpError(403, 'parent_only')));

async function getMember(req, id) {
  const m = await one(`SELECT * FROM members WHERE id = ? AND family_id = ?`, [id, req.family.id]);
  if (!m) fail(404, 'member_not_found');
  return parseMember(m);
}
async function getChore(req, id) {
  const c = await one(`SELECT * FROM chores WHERE id = ? AND family_id = ?`, [id, req.family.id]);
  if (!c) fail(404, 'chore_not_found');
  return parseChore(c);
}
async function getCompletion(req, id) {
  const c = await one(`SELECT * FROM completions WHERE id = ? AND family_id = ?`, [id, req.family.id]);
  if (!c) fail(404, 'not_found');
  return c;
}

// ---------- families ----------
app.post(
  '/api/families',
  wrap(async (req, res) => {
    const { name, parentName, avatar, color, pin, currency, withSamples, date } = req.body;
    if (!clean(name) || !clean(parentName)) fail(400, 'missing_name');
    if (!/^\d{4,6}$/.test(String(pin || ''))) fail(400, 'bad_pin');
    let code;
    do code = makeCode();
    while (await one(`SELECT id FROM families WHERE code = ?`, [code]));
    const family = {
      id: newId(),
      name: clean(name),
      code,
      token: token(),
      pin_hash: hashPin(pin),
      currency: clean(currency, 5) || 'AZN',
      streak_days: 3,
      streak_bonus: 50,
    };
    await run(
      `INSERT INTO families (id, name, code, token, pin_hash, currency, streak_days, streak_bonus, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [family.id, family.name, code, family.token, family.pin_hash, family.currency, 3, 50, now()],
    );
    const memberId = newId();
    await run(
      `INSERT INTO members (id, family_id, name, avatar, color, role, created_at) VALUES (?,?,?,?,?,'parent',?)`,
      [memberId, family.id, clean(parentName, 30), clean(avatar, 8) || '🦁', COLOR.test(color) ? color : '#7C4DFF', now()],
    );
    if (withSamples) await seedSamples(family, validDate(date));
    res.json({ token: family.token, code, memberId, parentToken: parentToken(family) });
  }),
);

app.post(
  '/api/join',
  wrap(async (req, res) => {
    const code = clean(req.body.code, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const family = await one(`SELECT * FROM families WHERE code = ?`, [code]);
    if (!family) fail(404, 'bad_code');
    res.json({ token: family.token, name: family.name });
  }),
);

app.use('/api', familyAuth);

app.get(
  '/api/state',
  wrap(async (req, res) => {
    const state = await familyState(req.family, validDate(req.query.date));
    state.hasSamples = await hasSamples(req.family.id);
    state.isParent = req.isParent;
    res.json(state);
  }),
);

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(': hello\n\n');
  const id = req.family.id;
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    listeners.get(id)?.delete(res);
  });
});

// ---------- parent PIN ----------
const pinFails = new Map();
app.post(
  '/api/parent/unlock',
  wrap(async (req, res) => {
    const f = pinFails.get(req.family.id) || { n: 0, until: 0 };
    if (Date.now() < f.until) fail(429, 'too_many_tries');
    if (!checkPin(req.body.pin, req.family.pin_hash)) {
      f.n++;
      if (f.n >= 5) Object.assign(f, { n: 0, until: Date.now() + 60_000 });
      pinFails.set(req.family.id, f);
      fail(403, 'wrong_pin');
    }
    pinFails.delete(req.family.id);
    res.json({ parentToken: parentToken(req.family) });
  }),
);

app.patch(
  '/api/family',
  parentOnly,
  wrap(async (req, res) => {
    const f = req.family;
    const b = req.body;
    const name = b.name !== undefined ? clean(b.name) || f.name : f.name;
    const currency = b.currency ? clean(b.currency, 5) : f.currency;
    const streakDays = b.streak_days ? Math.min(30, Math.max(2, Number(b.streak_days) | 0)) : f.streak_days;
    const streakBonus = b.streak_bonus !== undefined ? cents(b.streak_bonus) : f.streak_bonus;
    let pinHash = f.pin_hash;
    if (b.pin) {
      if (!/^\d{4,6}$/.test(String(b.pin))) fail(400, 'bad_pin');
      pinHash = hashPin(b.pin);
    }
    await run(`UPDATE families SET name=?, currency=?, streak_days=?, streak_bonus=?, pin_hash=? WHERE id=?`, [
      name,
      currency,
      streakDays,
      streakBonus,
      pinHash,
      f.id,
    ]);
    notify(f.id);
    res.json({ parentToken: parentToken({ ...f, pin_hash: pinHash }) });
  }),
);

app.post(
  '/api/samples/clear',
  parentOnly,
  wrap(async (req, res) => {
    await clearSamples(req.family.id);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

// ---------- members ----------
app.post(
  '/api/members',
  parentOnly,
  wrap(async (req, res) => {
    const { name, avatar, color, role } = req.body;
    if (!clean(name)) fail(400, 'missing_name');
    const id = newId();
    await run(
      `INSERT INTO members (id, family_id, name, avatar, color, role, created_at) VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        req.family.id,
        clean(name, 30),
        clean(avatar, 8) || '🐼',
        COLOR.test(color) ? color : '#2E9BFF',
        ['parent', 'adult', 'teen', 'kid'].includes(role) ? role : 'kid',
        now(),
      ],
    );
    notify(req.family.id);
    res.json({ id });
  }),
);

// Anyone can update their own look, jars and goal. Name and role need a parent.
app.patch(
  '/api/members/:id',
  wrap(async (req, res) => {
    const m = await getMember(req, req.params.id);
    const b = req.body;
    const upd = {
      avatar: b.avatar ? clean(b.avatar, 8) : m.avatar,
      color: COLOR.test(b.color || '') ? b.color : m.color,
      jar_split: m.jar_split,
      goal_name: b.goal_name !== undefined ? clean(b.goal_name, 40) || null : m.goal_name,
      goal_icon: b.goal_icon !== undefined ? clean(b.goal_icon, 8) || null : m.goal_icon,
      goal_price: b.goal_price !== undefined ? cents(b.goal_price) || null : m.goal_price,
      name: m.name,
      role: m.role,
    };
    if (b.jar_split) {
      const s = { spend: cents(b.jar_split.spend), save: cents(b.jar_split.save), give: cents(b.jar_split.give) };
      if (s.spend + s.save + s.give !== 100) fail(400, 'split_must_be_100');
      upd.jar_split = s;
    }
    if (req.isParent) {
      if (b.name) upd.name = clean(b.name, 30);
      if (['parent', 'adult', 'teen', 'kid'].includes(b.role)) upd.role = b.role;
    }
    await run(
      `UPDATE members SET avatar=?, color=?, jar_split=?, goal_name=?, goal_icon=?, goal_price=?, name=?, role=? WHERE id=?`,
      [upd.avatar, upd.color, JSON.stringify(upd.jar_split), upd.goal_name, upd.goal_icon, upd.goal_price, upd.name, upd.role, m.id],
    );
    await checkBadges(req.family.id, m.id);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/members/:id',
  parentOnly,
  wrap(async (req, res) => {
    const m = await getMember(req, req.params.id);
    for (const t of ['completions', 'transactions', 'badges']) await run(`DELETE FROM ${t} WHERE member_id = ?`, [m.id]);
    await run(`UPDATE chores SET assignee_id = NULL WHERE assignee_id = ?`, [m.id]);
    await run(`DELETE FROM members WHERE id = ?`, [m.id]);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

// ---------- chores ----------
function choreFields(b, old = {}) {
  const repeat = ['once', 'daily', 'weekly', 'weekdays'].includes(b.repeat) ? b.repeat : old.repeat || 'daily';
  const weekdays = Array.isArray(b.weekdays) ? b.weekdays.filter((d) => d >= 0 && d <= 6) : old.weekdays || [];
  if (repeat === 'weekdays' && !weekdays.length) fail(400, 'pick_days');
  const title = b.title !== undefined ? clean(b.title, 60) : old.title;
  if (!title) fail(400, 'missing_name');
  return {
    title,
    icon: clean(b.icon ?? old.icon, 8) || '⭐',
    price: b.price !== undefined ? cents(b.price) : old.price,
    assignee_id: b.assignee_id !== undefined ? b.assignee_id || null : old.assignee_id ?? null,
    repeat,
    weekdays,
    start_date: b.start_date ? validDate(b.start_date) : old.start_date || todayStr(),
    is_bonus: b.is_bonus !== undefined ? !!b.is_bonus : !!old.is_bonus,
    active: b.active !== undefined ? !!b.active : old.active ?? true,
  };
}

app.post(
  '/api/chores',
  parentOnly,
  wrap(async (req, res) => {
    const c = choreFields(req.body);
    if (c.assignee_id) await getMember(req, c.assignee_id);
    const id = newId();
    await run(
      `INSERT INTO chores (id, family_id, title, icon, price, assignee_id, repeat, weekdays, start_date, is_bonus, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.family.id, c.title, c.icon, c.price, c.assignee_id, c.repeat, JSON.stringify(c.weekdays), c.start_date, c.is_bonus ? 1 : 0, c.active ? 1 : 0, now()],
    );
    notify(req.family.id);
    res.json({ id });
  }),
);

app.patch(
  '/api/chores/:id',
  parentOnly,
  wrap(async (req, res) => {
    const old = await getChore(req, req.params.id);
    const c = choreFields(req.body, old);
    if (c.assignee_id) await getMember(req, c.assignee_id);
    await run(
      `UPDATE chores SET title=?, icon=?, price=?, assignee_id=?, repeat=?, weekdays=?, start_date=?, is_bonus=?, active=? WHERE id=?`,
      [c.title, c.icon, c.price, c.assignee_id, c.repeat, JSON.stringify(c.weekdays), c.start_date, c.is_bonus ? 1 : 0, c.active ? 1 : 0, old.id],
    );
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/chores/:id',
  parentOnly,
  wrap(async (req, res) => {
    const c = await getChore(req, req.params.id);
    await run(`DELETE FROM completions WHERE chore_id = ? AND status != 'approved'`, [c.id]);
    await run(`DELETE FROM chores WHERE id = ?`, [c.id]);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

// Claim an open chore ("I'll do it!")
app.post(
  '/api/chores/:id/claim',
  wrap(async (req, res) => {
    const chore = await getChore(req, req.params.id);
    const member = await getMember(req, req.body.memberId);
    const date = validDate(req.body.date);
    if (chore.assignee_id) fail(400, 'not_open');
    if (!isDueOn(chore, date)) fail(400, 'not_due');
    const period = periodKey(chore, date);
    const existing = await one(`SELECT * FROM completions WHERE chore_id = ? AND period = ?`, [chore.id, period]);
    if (existing) fail(409, 'already_taken');
    await run(
      `INSERT INTO completions (id, family_id, chore_id, member_id, period, status, amount, created_at, updated_at)
       VALUES (?,?,?,?,?,'claimed',?,?,?)`,
      [newId(), req.family.id, chore.id, member.id, period, chore.price, now(), now()],
    );
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

// Mark a chore done -> waiting for approval
app.post(
  '/api/chores/:id/done',
  wrap(async (req, res) => {
    const chore = await getChore(req, req.params.id);
    const member = await getMember(req, req.body.memberId);
    const date = validDate(req.body.date);
    if (!isDueOn(chore, date)) fail(400, 'not_due');
    if (chore.assignee_id && chore.assignee_id !== member.id) fail(403, 'not_yours');
    let photo = null;
    if (req.body.photo) {
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(req.body.photo)) fail(400, 'bad_photo');
      photo = req.body.photo;
    }
    const period = periodKey(chore, date);
    const existing = await one(`SELECT * FROM completions WHERE chore_id = ? AND period = ?`, [chore.id, period]);
    if (existing) {
      if (['pending', 'approved'].includes(existing.status)) fail(409, 'already_done');
      if (existing.member_id !== member.id) fail(409, 'already_taken');
      await run(
        `UPDATE completions SET status='pending', done_date=?, photo=?, amount=?, updated_at=? WHERE id=?`,
        [date, photo, chore.price, now(), existing.id],
      );
    } else {
      await run(
        `INSERT INTO completions (id, family_id, chore_id, member_id, period, done_date, status, photo, amount, created_at, updated_at)
         VALUES (?,?,?,?,?,?,'pending',?,?,?,?)`,
        [newId(), req.family.id, chore.id, member.id, period, date, photo, chore.price, now(), now()],
      );
    }
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

// Undo: take back a claim or a "Done" that is still waiting
app.post(
  '/api/completions/:id/undo',
  wrap(async (req, res) => {
    const c = await getCompletion(req, req.params.id);
    if (!['claimed', 'pending'].includes(c.status)) fail(400, 'cannot_undo');
    await run(`DELETE FROM completions WHERE id = ?`, [c.id]);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/completions/:id/photo',
  wrap(async (req, res) => {
    const c = await getCompletion(req, req.params.id);
    if (!c.photo) fail(404, 'no_photo');
    const [meta, data] = c.photo.split(',');
    res.set('Content-Type', meta.slice(5, meta.indexOf(';')));
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(data, 'base64'));
  }),
);

app.post(
  '/api/completions/:id/approve',
  parentOnly,
  wrap(async (req, res) => {
    const c = await getCompletion(req, req.params.id);
    if (c.status !== 'pending') fail(409, 'not_pending');
    await approveCompletion(req.family, c);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/completions/:id/reject',
  parentOnly,
  wrap(async (req, res) => {
    const c = await getCompletion(req, req.params.id);
    if (c.status !== 'pending') fail(409, 'not_pending');
    await run(`UPDATE completions SET status='rejected', note=?, photo=NULL, updated_at=? WHERE id=?`, [
      clean(req.body.note, 140) || null,
      now(),
      c.id,
    ]);
    notify(req.family.id);
    res.json({ ok: true });
  }),
);

// ---------- payday ----------
app.post(
  '/api/payouts',
  parentOnly,
  wrap(async (req, res) => {
    const m = await getMember(req, req.body.memberId);
    const t = await one(
      `SELECT COALESCE(SUM(CASE WHEN type='payout' THEN -amount ELSE amount END),0) AS owed FROM transactions WHERE member_id = ?`,
      [m.id],
    );
    const owed = Number(t.owed);
    const amount = req.body.amount !== undefined ? Math.min(cents(req.body.amount), owed) : owed;
    if (amount <= 0) fail(400, 'nothing_owed');
    await run(
      `INSERT INTO transactions (id, family_id, member_id, type, amount, label, icon, date, created_at) VALUES (?,?,?,'payout',?,'payout','💸',?,?)`,
      [newId(), req.family.id, m.id, amount, validDate(req.body.date), now()],
    );
    notify(req.family.id);
    res.json({ ok: true, amount });
  }),
);

// ---------- errors + web app ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
await migrate();
await loadSecret();
app.listen(PORT, () => console.log(`ChoreQuest server on http://localhost:${PORT}`));
