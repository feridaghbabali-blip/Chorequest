// Works out what goes on someone's Today board.
import { isDueOn, periodKey } from './shared/schedule.js';

export function boardFor(data, me, today) {
  const mine = [];
  const open = [];
  const bonus = [];
  if (!data || !me) return { mine, open, bonus, done: 0, total: 0, left: 0 };
  for (const chore of data.chores) {
    if (!isDueOn(chore, today)) continue;
    const period = periodKey(chore, today);
    const completion = data.completions.find((c) => c.chore_id === chore.id && c.period === period);
    // finished one-off jobs disappear the day after
    if (chore.repeat === 'once' && completion?.status === 'approved' && completion.done_date !== today) continue;
    const item = { chore, completion, period };
    if (chore.is_bonus) bonus.push(item);
    else if (chore.assignee_id === me.id || (!chore.assignee_id && completion?.member_id === me.id)) mine.push(item);
    else if (!chore.assignee_id) open.push(item);
  }
  const isDone = (i) => ['pending', 'approved'].includes(i.completion?.status);
  const done = mine.filter(isDone).length;
  const order = (a, b) => isDone(a) - isDone(b);
  mine.sort(order);
  open.sort((a, b) => !!a.completion - !!b.completion);
  bonus.sort((a, b) => !!a.completion - !!b.completion);
  return { mine, open, bonus, done, total: mine.length, left: mine.filter((i) => !isDone(i)).length };
}

export function repeatText(t, chore) {
  if (chore.repeat === 'daily') return t('repeatDaily');
  if (chore.repeat === 'weekly') return t('repeatWeekly');
  if (chore.repeat === 'once') return t('repeatOnce');
  const days = t('days');
  return t('repeatWeekdays', { days: chore.weekdays.map((d) => days[d]).join(', ') });
}

// Shrink a photo on the phone before uploading it.
export async function resizePhoto(file, max = 900) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}
