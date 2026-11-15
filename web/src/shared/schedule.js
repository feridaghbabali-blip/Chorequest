// Shared date + schedule helpers, used by both the server and the web app.
// Dates are plain "YYYY-MM-DD" strings in the family's local time.

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

// 0 = Monday ... 6 = Sunday
export function weekday(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

export function weekStart(s) {
  return addDays(s, -weekday(s));
}

// Is this chore on the board for the given date?
export function isDueOn(chore, date) {
  if (!chore.active) return false;
  if (chore.start_date && date < chore.start_date) return false;
  switch (chore.repeat) {
    case 'daily':
    case 'weekly':
    case 'once':
      return true;
    case 'weekdays':
      return (chore.weekdays || []).includes(weekday(date));
    default:
      return false;
  }
}

// Each chore can be done once per "period". The key identifies that period.
export function periodKey(chore, date) {
  if (chore.repeat === 'once') return 'once';
  if (chore.repeat === 'weekly') return 'w' + weekStart(date);
  return date;
}

// Split an amount (in cents) into the Spend / Save / Give jars.
export function splitJars(amount, split) {
  const s = split || { spend: 100, save: 0, give: 0 };
  const save = Math.round((amount * s.save) / 100);
  const give = Math.round((amount * s.give) / 100);
  return { spend: amount - save - give, save, give };
}

// Longest run of consecutive days ending exactly on `endDate`.
export function runEndingOn(dateSet, endDate) {
  let n = 0;
  let d = endDate;
  while (dateSet.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// Current streak: run ending today, or yesterday if nothing is done yet today.
export function currentStreak(dates, today) {
  const set = new Set(dates);
  if (set.has(today)) return runEndingOn(set, today);
  return runEndingOn(set, addDays(today, -1));
}

export const BADGES = [
  { id: 'first_chore', icon: '🌟' },
  { id: 'ten_chores', icon: '🐝' },
  { id: 'fifty_chores', icon: '🏆' },
  { id: 'streak_3', icon: '🔥' },
  { id: 'streak_7', icon: '☄️' },
  { id: 'bonus_hero', icon: '🦸' },
  { id: 'saver', icon: '🐷' },
  { id: 'giver', icon: '💝' },
  { id: 'goal_reached', icon: '🎯' },
];

export const LEVELS = [0, 50, 120, 220, 350, 520, 750, 1000, 1300, 1700];

export function levelFor(xp) {
  let lvl = 1;
  LEVELS.forEach((need, i) => {
    if (xp >= need) lvl = i + 1;
  });
  const cur = LEVELS[lvl - 1] ?? 0;
  const next = LEVELS[lvl] ?? cur + 400;
  return { level: lvl, xp, progress: (xp - cur) / (next - cur), next };
}
