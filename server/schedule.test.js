import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDueOn, periodKey, splitJars, currentStreak, weekStart, weekday, levelFor } from '../web/src/shared/schedule.js';

test('weekday and week start (Monday first)', () => {
  assert.equal(weekday('2026-11-16'), 0); // Monday
  assert.equal(weekday('2026-11-15'), 6); // Sunday
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
});

test('chore schedules', () => {
  const base = { active: true, start_date: '2026-11-01' };
  assert.ok(isDueOn({ ...base, repeat: 'daily' }, '2026-11-15'));
  assert.ok(!isDueOn({ ...base, repeat: 'daily' }, '2026-10-30'));
  assert.ok(isDueOn({ ...base, repeat: 'weekdays', weekdays: [0, 2] }, '2026-11-16'));
  assert.ok(!isDueOn({ ...base, repeat: 'weekdays', weekdays: [0, 2] }, '2026-11-15'));
  assert.ok(!isDueOn({ ...base, repeat: 'daily', active: false }, '2026-11-15'));
  assert.equal(periodKey({ repeat: 'weekly' }, '2026-11-15'), 'w2026-11-09');
  assert.equal(periodKey({ repeat: 'once' }, '2026-11-15'), 'once');
});

test('jar split always adds up', () => {
  const j = splitJars(77, { spend: 50, save: 30, give: 20 });
  assert.equal(j.spend + j.save + j.give, 77);
});

test('streaks', () => {
  assert.equal(currentStreak(['2026-11-13', '2026-11-14'], '2026-11-15'), 2); // today not done yet
  assert.equal(currentStreak(['2026-11-13', '2026-11-14', '2026-11-15'], '2026-11-15'), 3);
  assert.equal(currentStreak(['2026-11-12'], '2026-11-15'), 0);
});

test('levels', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(55).level, 2);
});
