// Pure booking rules: which start times are free for a barber on a day.
// Times are minutes after midnight in the shop's own time zone.

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// 0 = Monday ... 6 = Sunday
export function weekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// The current date and minute in the shop's time zone
export function shopNow(timezone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Free start times for one barber.
 * busy: [{start, end}] in minutes (existing bookings and blocked time)
 */
export function freeStarts({ shop, barber, date, minutes, busy, now }) {
  const day = weekday(date);
  const hours = shop.hours[day];
  if (!hours || !barber.days.includes(day)) return [];
  const open = toMin(hours[0]);
  const close = toMin(hours[1]);
  const earliest = date === now.date ? now.minute + 30 : date < now.date ? Infinity : 0; // 30 min notice
  const out = [];
  for (let s = open; s + minutes <= close; s += shop.slotStep) {
    if (s < earliest) continue;
    const e = s + minutes;
    if (busy.some((b) => s < b.end && b.start < e)) continue;
    out.push(s);
  }
  return out;
}
