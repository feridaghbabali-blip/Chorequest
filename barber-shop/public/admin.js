// Staff page: see a day's bookings per barber, cancel, and block time.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let pw = sessionStorage.getItem('pw') || '';
let info;
let date;

const addDays = (d, n) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
async function api(path, opts = {}) {
  const r = await fetch('/api/admin' + path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-password': pw } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error), { status: r.status });
  return data;
}

async function load() {
  const d = await api('/day?date=' + date);
  $('#date').value = date;
  const dt = new Date(date + 'T12:00:00Z');
  $('#day-title').textContent = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const live = d.bookings.filter((b) => b.status === 'booked');
  const total = live.reduce((s, b) => s + (info.services.find((x) => x.id === b.service_id)?.price || 0), 0);
  $('#day-sum').textContent = `${live.length} booking${live.length === 1 ? '' : 's'} · ${total} ${info.shop.currency} expected`;
  $('#by-barber').innerHTML = info.barbers
    .map((barber) => {
      const items = [
        ...d.bookings.filter((b) => b.barber_id === barber.id).map((b) => ({ kind: 'b', ...b })),
        ...d.blocks.filter((b) => b.barber_id === barber.id).map((b) => ({ kind: 'x', ...b })),
      ].sort((a, b) => a.start - b.start);
      return `<div><h3 style="margin-bottom:10px">${esc(barber.name)}</h3><div class="list">${
        items.length
          ? items
              .map((i) =>
                i.kind === 'b'
                  ? `<div class="row ${i.status}"><span class="t">${i.time}–${i.endTime}</span>
                      <div class="who"><strong>${esc(i.name)}</strong> · <span class="copy">${esc(i.phone)}</span><br><span class="tag">${esc(info.services.find((s) => s.id === i.service_id)?.name || i.service_id)}</span> ${i.note ? `<span class="note">“${esc(i.note)}”</span>` : ''} <span class="note">#${i.code}</span></div>
                      ${i.status === 'booked' ? `<button class="small-btn danger" data-cancel="${i.id}">Cancel</button>` : '<span class="tag">Cancelled</span>'}</div>`
                  : `<div class="row block"><span class="t">${i.time}–${i.endTime}</span><div>Blocked${i.reason ? ' · ' + esc(i.reason) : ''}</div><button class="small-btn" data-unblock="${i.id}">Remove</button></div>`,
              )
              .join('')
          : '<div class="row"><span class="muted">No bookings.</span></div>'
      }</div></div>`;
    })
    .join('');
  $('#upcoming').textContent = d.upcoming.length ? d.upcoming.map((u) => `${u.date}: ${u.n}`).join(' · ') : 'Nothing booked yet.';
  document.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      if (b.dataset.sure !== '1') {
        b.dataset.sure = '1';
        b.textContent = 'Tap again to cancel';
        return;
      }
      await api(`/bookings/${b.dataset.cancel}/cancel`, { method: 'POST' });
      load();
    };
  });
  document.querySelectorAll('[data-unblock]').forEach((b) => (b.onclick = async () => (await api('/blocks/' + b.dataset.unblock, { method: 'DELETE' }), load())));
}

async function start() {
  info = await (await fetch('/api/info')).json();
  date = info.today;
  $('#b-barber').innerHTML = info.barbers.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  try {
    await load();
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#logout').hidden = false;
  } catch (e) {
    $('#login').hidden = false;
    if (pw) $('#login-err').textContent = e.status === 429 ? 'Too many tries. Wait 5 minutes.' : 'Wrong password.';
  }
}

$('#login').onsubmit = (e) => {
  e.preventDefault();
  pw = $('#pw').value;
  sessionStorage.setItem('pw', pw);
  start();
};
$('#logout').onclick = () => (sessionStorage.removeItem('pw'), location.reload());
$('#prev').onclick = () => ((date = addDays(date, -1)), load());
$('#next').onclick = () => ((date = addDays(date, 1)), load());
$('#today').onclick = () => ((date = info.today), load());
$('#date').onchange = (e) => e.target.value && ((date = e.target.value), load());
$('#block').onsubmit = async (e) => {
  e.preventDefault();
  await api('/blocks', { method: 'POST', body: JSON.stringify({ barber: $('#b-barber').value, date, from: $('#b-from').value, to: $('#b-to').value, reason: $('#b-reason').value }) });
  load();
};
start();
