import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeStarts, toMin, weekday } from './slots.js';
import { SHOP, BARBERS } from './shop.js';

const elvin = BARBERS[0];
const now = { date: '2026-11-15', minute: 0 };

test('Monday is weekday 0', () => assert.equal(weekday('2026-11-16'), 0));
test('closed on Sunday', () => assert.deepEqual(freeStarts({ shop: SHOP, barber: elvin, date: '2026-11-22', minutes: 30, busy: [], now }), []));
test('no overlap with an existing booking', () => {
  const busy = [{ start: toMin('11:00'), end: toMin('11:45') }];
  const free = freeStarts({ shop: SHOP, barber: elvin, date: '2026-11-16', minutes: 30, busy, now });
  assert.ok(free.includes(toMin('10:30')));
  assert.ok(!free.includes(toMin('10:45')));
  assert.ok(!free.includes(toMin('11:30')));
  assert.ok(free.includes(toMin('11:45')));
});
test('last start leaves room before closing', () => {
  const free = freeStarts({ shop: SHOP, barber: elvin, date: '2026-11-16', minutes: 60, busy: [], now });
  assert.equal(free.at(-1), toMin('19:00'));
});
test('today: 30 minutes notice', () => {
  const free = freeStarts({ shop: SHOP, barber: elvin, date: '2026-11-16', minutes: 30, busy: [], now: { date: '2026-11-16', minute: toMin('14:05') } });
  assert.equal(free[0], toMin('14:45'));
});
