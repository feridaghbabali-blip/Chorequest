// Public website: renders shop info and runs the booking steps.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const weekday = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7;
};
const addDays = (d, n) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
const prettyDate = (d) => `${DAYS[weekday(d)]} ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

let info;
const money = (n) => `${n} ${info.shop.currency}`;
const getJSON = async (url, opts) => {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'error'), { code: data.error });
  return data;
};

async function main() {
  info = await getJSON('/api/info');
  const { shop, services, barbers } = info;
  document.querySelectorAll('[data-shop]').forEach((el) => (el.textContent = shop[el.dataset.shop]));
  $('#hero-eyebrow').textContent = `Barbers in ${shop.city}`;
  $('#year').textContent = info.today.slice(0, 4);
  $('#cut-price').textContent = money(services[0].price);

  $('#price-board').innerHTML = services
    .map(
      (s) => `<div class="price-row">
        <div class="name">${esc(s.name)}</div><div class="price num">${money(s.price)}</div>
        <div class="sub"><span>${esc(s.note)}</span><span class="mins">${s.minutes} min</span></div>
      </div>`,
    )
    .join('');

  $('#barber-list').innerHTML = barbers
    .map(
      (b) => `<article class="barber">
        <div class="mono" aria-hidden="true">${esc(b.name[0])}</div>
        <div><h3>${esc(b.name)}</h3><p class="muted">${esc(b.role)}</p><p class="note">Cutting since ${b.since}</p></div>
        <div class="days" aria-label="Working days">${DAYS_SHORT.map((d, i) => `<span class="day-dot ${b.days.includes(i) && shop.hours[i] ? 'on' : ''}">${d}</span>`).join('')}</div>
      </article>`,
    )
    .join('');

  const todayWd = weekday(info.today);
  $('#hours').innerHTML = DAYS.map((d, i) => `<tr class="${i === todayWd ? 'today' : ''}"><td>${d}</td><td>${shop.hours[i] ? shop.hours[i].join(' – ') : 'Closed'}</td></tr>`).join('');

  nextFree();
  renderBooking();
}

async function nextFree() {
  for (let i = 0; i < 7; i++) {
    const date = addDays(info.today, i);
    const { times } = await getJSON(`/api/slots?date=${date}&service=${info.services[0].id}&barber=any`);
    if (times.length) {
      const t = times[0];
      const who = t.barbers.map((id) => info.barbers.find((b) => b.id === id)?.name).join(' or ');
      $('#next-time').textContent = t.time;
      $('#next-detail').textContent = `${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : prettyDate(date)} with ${who}`;
      return;
    }
  }
  $('#next-time').textContent = 'Full';
  $('#next-detail').textContent = 'The book is full this week. Call us for a cancellation.';
}

// ---------- booking ----------
const state = { service: null, barber: 'any', date: null, time: null, times: null, name: '', phone: '', note: '', error: '', busy: false, done: null };

function set(patch) {
  Object.assign(state, patch);
  renderBooking();
}

async function loadTimes() {
  if (!state.service || !state.date) return;
  state.times = null;
  renderBooking();
  try {
    const { times } = await getJSON(`/api/slots?date=${state.date}&service=${state.service}&barber=${state.barber}`);
    set({ times });
  } catch {
    set({ times: [], error: 'Could not load free times. Check your connection and try again.' });
  }
}

function renderBooking() {
  const root = $('#booking');
  const { shop, services, barbers } = info;
  if (state.done) {
    const d = state.done;
    const svc = services.find((s) => s.id === d.service);
    const barber = barbers.find((b) => b.id === d.barber);
    root.innerHTML = `<div class="done-card" role="status">
      <p class="eyebrow">You're booked</p>
      <h3>${esc(svc.name)} with ${esc(barber.name)}</h3>
      <p><strong>${prettyDate(d.date)} at ${d.time}</strong> · ${svc.minutes} min · ${money(svc.price)}, paid at the shop</p>
      <p>Your booking code: <span class="code">${d.code}</span></p>
      <p class="note">Keep this code. To cancel, open “Cancel a booking” at the bottom of this page, or call ${esc(shop.phone)}.</p>
      <div><button class="btn ghost" id="again">Book another</button></div>
    </div>`;
    $('#again').onclick = () => set({ done: null, time: null, times: null, date: null });
    return;
  }

  const svc = services.find((s) => s.id === state.service);
  const days = Array.from({ length: shop.bookDaysAhead + 1 }, (_, i) => addDays(info.today, i));
  const barberObj = barbers.find((b) => b.id === state.barber);
  const dayOpen = (d) => shop.hours[weekday(d)] && (state.barber === 'any' ? barbers.some((b) => b.days.includes(weekday(d))) : barberObj.days.includes(weekday(d)));

  root.innerHTML = `<div class="steps">
    <div class="step">
      <div class="step-label"><span class="n">1</span>Choose a service</div>
      <div class="choices">${services
        .map((s) => `<button class="choice" data-service="${s.id}" aria-pressed="${state.service === s.id}">${esc(s.name)}<small>${s.minutes} min · ${money(s.price)}</small></button>`)
        .join('')}</div>
    </div>
    <div class="step ${svc ? '' : 'locked'}">
      <div class="step-label"><span class="n">2</span>Choose a barber</div>
      <div class="choices">
        <button class="choice" data-barber="any" aria-pressed="${state.barber === 'any'}">Anyone free<small>Most times available</small></button>
        ${barbers.map((b) => `<button class="choice" data-barber="${b.id}" aria-pressed="${state.barber === b.id}">${esc(b.name)}<small>${esc(b.role)}</small></button>`).join('')}
      </div>
    </div>
    <div class="step ${svc ? '' : 'locked'}">
      <div class="step-label"><span class="n">3</span>Pick a day</div>
      <div class="days-strip">${days
        .map((d, i) => `<button class="day-btn" data-date="${d}" aria-pressed="${state.date === d}" ${dayOpen(d) ? '' : 'disabled'} aria-label="${prettyDate(d)}">
          <span>${i === 0 ? 'Today' : DAYS_SHORT[weekday(d)]}</span><b>${Number(d.slice(8))}</b><span>${MONTHS[Number(d.slice(5, 7)) - 1]}</span></button>`)
        .join('')}</div>
    </div>
    <div class="step ${svc && state.date ? '' : 'locked'}">
      <div class="step-label"><span class="n">4</span>Pick a time</div>
      ${
        !state.date
          ? '<p class="note">Choose a day first.</p>'
          : state.times === null
            ? '<p class="note">Loading free times…</p>'
            : state.times.length
              ? `<div class="times">${state.times.map((t) => `<button class="time-btn" data-time="${t.time}" aria-pressed="${state.time === t.time}">${t.time}</button>`).join('')}</div>`
              : '<p class="empty">No free times this day. Try another day or another barber.</p>'
      }
    </div>
    <form class="step ${state.time ? '' : 'locked'}" id="details" novalidate>
      <div class="step-label"><span class="n">5</span>Your details</div>
      <div class="form-grid">
        <label class="f">Name<input class="input" id="f-name" name="name" autocomplete="name" required maxlength="60" value="${esc(state.name)}" /></label>
        <label class="f">Phone<input class="input" id="f-phone" name="phone" type="tel" autocomplete="tel" required maxlength="30" placeholder="+994 …" value="${esc(state.phone)}" /></label>
        <label class="f full">Anything we should know? (optional)<input class="input" id="f-note" name="note" maxlength="200" value="${esc(state.note)}" /></label>
      </div>
      ${
        svc && state.time
          ? `<div class="summary"><div><p class="note">${esc(svc.name)} · ${state.barber === 'any' ? 'first free barber' : esc(barberObj.name)}</p><strong>${prettyDate(state.date)}, ${state.time}</strong></div>
             <button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Booking…' : `Confirm booking · ${money(svc.price)}`}</button></div>`
          : ''
      }
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}
      <p class="note">Pay at the shop. Please arrive 5 minutes early.</p>
    </form>
  </div>`;

  root.querySelectorAll('[data-service]').forEach((b) => (b.onclick = () => (set({ service: b.dataset.service, time: null, error: '' }), loadTimes())));
  root.querySelectorAll('[data-barber]').forEach((b) => (b.onclick = () => (set({ barber: b.dataset.barber, time: null, error: '' }), loadTimes())));
  root.querySelectorAll('[data-date]').forEach((b) => (b.onclick = () => (set({ date: b.dataset.date, time: null, error: '' }), loadTimes())));
  root.querySelectorAll('[data-time]').forEach((b) => (b.onclick = () => set({ time: b.dataset.time, error: '' })));
  for (const k of ['name', 'phone', 'note']) $('#f-' + k).oninput = (e) => (state[k] = e.target.value);
  $('#details').onsubmit = submit;
}

async function submit(e) {
  e.preventDefault();
  if (state.name.trim().length < 2) return set({ error: 'Please type your name.' });
  if (state.phone.replace(/\D/g, '').length < 7) return set({ error: 'Please type a phone number so we can reach you.' });
  set({ busy: true, error: '' });
  try {
    const done = await getJSON('/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: state.service, barber: state.barber, date: state.date, time: state.time, name: state.name, phone: state.phone, note: state.note }),
    });
    set({ busy: false, done, name: '', phone: '', note: '' });
    $('#book').scrollIntoView();
    nextFree();
  } catch (err) {
    if (err.code === 'slot_taken') {
      set({ busy: false, time: null, error: 'Someone just took that time. Please pick another one.' });
      loadTimes();
    } else set({ busy: false, error: 'Booking failed. Check your connection and try again, or call us.' });
  }
}

main().catch(() => {
  $('#booking').innerHTML = '<p class="error">The booking system is not reachable right now. Please call us to book.</p>';
});
