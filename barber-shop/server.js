// Barber shop server: serves the website and the booking API.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { SHOP, SERVICES, BARBERS } from './shop.js';
import { freeStarts, shopNow, toMin, toHHMM, addDays } from './slots.js';

// ---------- database: local file, or Turso when TURSO_DATABASE_URL is set ----------
let url = process.env.TURSO_DATABASE_URL;
if (!url) {
  fs.mkdirSync('data', { recursive: true });
  url = 'file:' + (process.env.DB_FILE || 'data/barber.db');
}
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
await db.executeMultiple(`
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  barber_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  barber_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_b_day ON bookings(date, barber_id);
CREATE INDEX IF NOT EXISTS idx_bl_day ON blocks(date, barber_id);
`);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'barber123';
if (!process.env.ADMIN_PASSWORD) console.warn('⚠  ADMIN_PASSWORD not set: using the demo password "barber123"');

const app = express();
app.use(express.json({ limit: '20kb' }));

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;

async function busyFor(barberId, date, exec = db) {
  const r = await exec.execute({
    sql: `SELECT start, end FROM bookings WHERE barber_id = ? AND date = ? AND status = 'booked'
          UNION ALL SELECT start, end FROM blocks WHERE barber_id = ? AND date = ?`,
    args: [barberId, date, barberId, date],
  });
  return r.rows.map((x) => ({ start: Number(x.start), end: Number(x.end) }));
}

function inRange(date) {
  const now = shopNow(SHOP.timezone);
  return date >= now.date && date <= addDays(now.date, SHOP.bookDaysAhead);
}

// ---------- public API ----------
app.get('/api/info', (req, res) => {
  const now = shopNow(SHOP.timezone);
  res.json({ shop: SHOP, services: SERVICES, barbers: BARBERS.map(({ id, name, role, since, days }) => ({ id, name, role, since, days })), today: now.date });
});

// Free times for a service on a day: {times: [{time, barbers:[ids]}]}
app.get('/api/slots', async (req, res) => {
  const { date, service, barber } = req.query;
  const svc = SERVICES.find((s) => s.id === service);
  if (!svc || !isDate(date)) return res.status(400).json({ error: 'bad_request' });
  if (!inRange(date)) return res.json({ times: [] });
  const now = shopNow(SHOP.timezone);
  const list = barber && barber !== 'any' ? BARBERS.filter((b) => b.id === barber) : BARBERS;
  const map = new Map();
  for (const b of list) {
    const busy = await busyFor(b.id, date);
    for (const s of freeStarts({ shop: SHOP, barber: b, date, minutes: svc.minutes, busy, now })) {
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(b.id);
    }
  }
  const times = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([s, ids]) => ({ time: toHHMM(s), barbers: ids }));
  res.json({ times });
});

app.post('/api/bookings', async (req, res) => {
  const b = req.body || {};
  const svc = SERVICES.find((s) => s.id === b.service);
  const name = clean(b.name, 60);
  const phone = clean(b.phone, 30);
  if (!svc || !isDate(b.date) || !/^\d{2}:\d{2}$/.test(b.time || '')) return res.status(400).json({ error: 'bad_request' });
  if (name.length < 2) return res.status(400).json({ error: 'name_required' });
  if (phone.replace(/\D/g, '').length < 7) return res.status(400).json({ error: 'phone_required' });
  if (!inRange(b.date)) return res.status(400).json({ error: 'date_unavailable' });
  const start = toMin(b.time);
  const candidates = b.barber && b.barber !== 'any' ? BARBERS.filter((x) => x.id === b.barber) : BARBERS;
  const now = shopNow(SHOP.timezone);

  // Check and insert inside one write transaction so two people can't take the same time.
  const tx = await db.transaction('write');
  try {
    let chosen = null;
    for (const barber of candidates) {
      const busy = await busyFor(barber.id, b.date, tx);
      if (freeStarts({ shop: SHOP, barber, date: b.date, minutes: svc.minutes, busy, now }).includes(start)) {
        chosen = barber;
        break;
      }
    }
    if (!chosen) {
      await tx.rollback();
      return res.status(409).json({ error: 'slot_taken' });
    }
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    await tx.execute({
      sql: `INSERT INTO bookings (id, code, barber_id, service_id, date, start, end, name, phone, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), code, chosen.id, svc.id, b.date, start, start + svc.minutes, name, phone, clean(b.note, 200) || null, new Date().toISOString()],
    });
    await tx.commit();
    res.json({ code, barber: chosen.id, date: b.date, time: b.time, service: svc.id });
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
});

app.get('/api/bookings/:code', async (req, res) => {
  const [bk] = await rows(`SELECT code, barber_id, service_id, date, start, status FROM bookings WHERE code = ?`, [req.params.code.toUpperCase()]);
  if (!bk) return res.status(404).json({ error: 'not_found' });
  res.json({ ...bk, time: toHHMM(Number(bk.start)) });
});

app.post('/api/bookings/:code/cancel', async (req, res) => {
  const r = await db.execute({ sql: `UPDATE bookings SET status = 'cancelled' WHERE code = ? AND status = 'booked'`, args: [req.params.code.toUpperCase()] });
  if (!r.rowsAffected) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ---------- admin API (password in the x-admin-password header) ----------
const attempts = new Map();
app.use('/api/admin', (req, res, next) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, until: 0 };
  if (Date.now() < a.until) return res.status(429).json({ error: 'too_many_tries' });
  const given = Buffer.from(String(req.get('x-admin-password') || ''));
  const real = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    a.n++;
    if (a.n >= 8) Object.assign(a, { n: 0, until: Date.now() + 5 * 60_000 });
    attempts.set(ip, a);
    return res.status(401).json({ error: 'wrong_password' });
  }
  attempts.delete(ip);
  next();
});

app.get('/api/admin/day', async (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : shopNow(SHOP.timezone).date;
  const bookings = await rows(`SELECT * FROM bookings WHERE date = ? ORDER BY start`, [date]);
  const blocks = await rows(`SELECT * FROM blocks WHERE date = ? ORDER BY start`, [date]);
  const upcoming = await rows(`SELECT date, COUNT(*) AS n FROM bookings WHERE status = 'booked' AND date >= ? GROUP BY date ORDER BY date LIMIT 30`, [shopNow(SHOP.timezone).date]);
  res.json({ date, bookings: bookings.map((b) => ({ ...b, time: toHHMM(Number(b.start)), endTime: toHHMM(Number(b.end)) })), blocks: blocks.map((b) => ({ ...b, time: toHHMM(Number(b.start)), endTime: toHHMM(Number(b.end)) })), upcoming });
});

app.post('/api/admin/bookings/:id/cancel', async (req, res) => {
  await db.execute({ sql: `UPDATE bookings SET status = 'cancelled' WHERE id = ?`, args: [req.params.id] });
  res.json({ ok: true });
});

app.post('/api/admin/blocks', async (req, res) => {
  const { barber, date, from, to, reason } = req.body || {};
  if (!BARBERS.some((b) => b.id === barber) || !isDate(date) || !/^\d{2}:\d{2}$/.test(from || '') || !/^\d{2}:\d{2}$/.test(to || '') || toMin(to) <= toMin(from))
    return res.status(400).json({ error: 'bad_request' });
  await db.execute({ sql: `INSERT INTO blocks (id, barber_id, date, start, end, reason) VALUES (?,?,?,?,?,?)`, args: [crypto.randomUUID(), barber, date, toMin(from), toMin(to), clean(reason, 80) || null] });
  res.json({ ok: true });
});

app.delete('/api/admin/blocks/:id', async (req, res) => {
  await db.execute({ sql: `DELETE FROM blocks WHERE id = ?`, args: [req.params.id] });
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// ---------- website ----------
const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
app.use(express.static(pub, { extensions: ['html'] }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Barber shop on http://localhost:${PORT}`));
