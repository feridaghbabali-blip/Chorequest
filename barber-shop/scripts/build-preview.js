// Builds a single-page preview of the site for claude.ai: same pages and booking
// steps, but bookings are kept in the visitor's own browser instead of the server.
import fs from 'node:fs';

const strip = (f) => fs.readFileSync(f, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const html = fs.readFileSync('public/index.html', 'utf8');
const body = html
  .slice(html.indexOf('<header'), html.indexOf('<script type="module"'))
  .replace(/<span><a href="\/cancel">[\s\S]*?<\/span>/, '<span>Preview: bookings are saved only in this browser.</span>');
const css = fs.readFileSync('public/styles.css', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

const shim = `
${strip('shop.js')}
${strip('slots.js')}
// Stand-in for the server API, stored in this browser only.
const KEY = 'barber-preview-bookings';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const save = (b) => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {} };
const busyFor = (barber, date) => load().filter((b) => b.barber === barber && b.date === date && b.status === 'booked').map((b) => ({ start: b.start, end: b.end }));
const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const u = new URL(url, location.href);
  if (!u.pathname.startsWith('/api/')) return realFetch(url, opts);
  const now = shopNow(SHOP.timezone);
  const inRange = (d) => d >= now.date && d <= addDays(now.date, SHOP.bookDaysAhead);
  if (u.pathname === '/api/info') return reply(200, { shop: SHOP, services: SERVICES, barbers: BARBERS, today: now.date });
  if (u.pathname === '/api/slots') {
    const q = u.searchParams; const svc = SERVICES.find((s) => s.id === q.get('service')); const date = q.get('date');
    if (!svc || !inRange(date)) return reply(200, { times: [] });
    const list = q.get('barber') && q.get('barber') !== 'any' ? BARBERS.filter((b) => b.id === q.get('barber')) : BARBERS;
    const map = new Map();
    for (const b of list) for (const s of freeStarts({ shop: SHOP, barber: b, date, minutes: svc.minutes, busy: busyFor(b.id, date), now })) { if (!map.has(s)) map.set(s, []); map.get(s).push(b.id); }
    return reply(200, { times: [...map].sort((a, b) => a[0] - b[0]).map(([s, ids]) => ({ time: toHHMM(s), barbers: ids })) });
  }
  if (u.pathname === '/api/bookings' && opts.method === 'POST') {
    const b = JSON.parse(opts.body); const svc = SERVICES.find((s) => s.id === b.service); const start = toMin(b.time);
    const cands = b.barber && b.barber !== 'any' ? BARBERS.filter((x) => x.id === b.barber) : BARBERS;
    const chosen = cands.find((x) => freeStarts({ shop: SHOP, barber: x, date: b.date, minutes: svc.minutes, busy: busyFor(x.id, b.date), now }).includes(start));
    if (!chosen) return reply(409, { error: 'slot_taken' });
    const code = Math.random().toString(16).slice(2, 10).toUpperCase();
    save([...load(), { code, barber: chosen.id, service: svc.id, date: b.date, start, end: start + svc.minutes, status: 'booked' }]);
    return reply(200, { code, barber: chosen.id, date: b.date, time: b.time, service: svc.id });
  }
  return reply(404, { error: 'not_found' });
};
`;

const page = `<title>Kəsim Barber Co.</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Instrument+Sans:wght@400;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap">
<style>${css}</style>
${body}
<script type="module">{${shim}}
${app}</script>
`;
fs.mkdirSync('preview', { recursive: true });
fs.writeFileSync('preview/barber-preview.html', page);
console.log('preview/barber-preview.html', Math.round(page.length / 1024) + ' KB');
