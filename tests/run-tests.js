/**
 * Tests for dateMath.js — run with: node tests/run-tests.js
 * No external dependencies, no installs required.
 */
'use strict';

// Use dynamic import-like require that works in plain Node
const path = require('path');
const dm = require(path.join(__dirname, '..', 'dateMath.js'));

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, name, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail: detail || '' });
    console.log(`  ✗ ${name}  ${detail || ''}`);
  }
}

function iso(dt) { return dm.toISODate(dt); }

console.log('\nPharmacy Date Calculator — dateMath.js tests\n');

// ─── Day arithmetic ──────────────────────────────────────────────────────────
console.log('Day addition:');
let r = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 1, perContainer: 30,
});
assert(iso(r.endDate) === '2026-11-07',
  '8 Oct 2026 + 30 days = 7 Nov 2026',
  `got ${iso(r.endDate)}`);

r = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 2, perContainer: 30,
});
assert(iso(r.endDate) === '2026-12-07',
  '8 Oct 2026 + 60 days = 7 Dec 2026',
  `got ${iso(r.endDate)}`);

r = dm.calculate({
  startDate: dm.makeDate(2026, 10, 1), containers: 1, perContainer: 30,
});
assert(iso(r.endDate) === '2026-10-31',
  '1 Oct 2026 + 30 days = 31 Oct 2026',
  `got ${iso(r.endDate)}`);

r = dm.calculate({
  startDate: dm.makeDate(2027, 2, 28), containers: 1, perContainer: 1,
});
assert(iso(r.endDate) === '2027-03-01',
  '28 Feb 2027 + 1 day = 1 Mar 2027 (non-leap)',
  `got ${iso(r.endDate)}`);

r = dm.calculate({
  startDate: dm.makeDate(2028, 2, 28), containers: 1, perContainer: 1,
});
assert(iso(r.endDate) === '2028-02-29',
  '28 Feb 2028 + 1 day = 29 Feb 2028 (leap year)',
  `got ${iso(r.endDate)}`);

r = dm.calculate({
  startDate: dm.makeDate(2026, 12, 31), containers: 1, perContainer: 1,
});
assert(iso(r.endDate) === '2027-01-01',
  '31 Dec 2026 + 1 day = 1 Jan 2027 (year rollover)',
  `got ${iso(r.endDate)}`);

// ─── Month arithmetic ────────────────────────────────────────────────────────
console.log('\nCalendar months:');
r = dm.calculate({
  startDate: dm.makeDate(2028, 1, 31), containers: 1, perContainer: 1,
  unit: 'months',
});
assert(iso(r.endDate) === '2028-02-29',
  '31 Jan 2028 + 1 calendar month = 29 Feb 2028',
  `got ${iso(r.endDate)}`);

// ─── Subtraction ─────────────────────────────────────────────────────────────
console.log('\nSubtraction:');
r = dm.calculate({
  startDate: dm.makeDate(2028, 3, 1), containers: 1, perContainer: 1,
  operation: 'subtract',
});
assert(iso(r.endDate) === '2028-02-29',
  '1 Mar 2028 − 1 day = 29 Feb 2028',
  `got ${iso(r.endDate)}`);

// ─── Quantity math ───────────────────────────────────────────────────────────
console.log('\nQuantity math:');
r = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 2, perContainer: 60,
});
assert(r.tablets === 120 && r.days === 120,
  '2 × 60 = 120 tablets = 120 days',
  `got ${r.tablets} tablets, ${r.days} days`);

// ─── Count-start-day option ──────────────────────────────────────────────────
console.log('\nCount-start-day:');
const base = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 1, perContainer: 30,
  countStartDay: false,
});
const counted = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 1, perContainer: 30,
  countStartDay: true,
});
// Count-start-day shifts one day earlier when adding
const diffDays = (counted.endDate.getTime() - base.endDate.getTime()) / 86400000;
assert(diffDays === -1,
  'Count-start-day option shifts result back by one day (add)',
  `base=${iso(base.endDate)}, counted=${iso(counted.endDate)}, diff=${diffDays}`);

// Subtraction direction
const baseSub = dm.calculate({
  startDate: dm.makeDate(2026, 11, 7), containers: 1, perContainer: 30,
  operation: 'subtract', countStartDay: false,
});
const countedSub = dm.calculate({
  startDate: dm.makeDate(2026, 11, 7), containers: 1, perContainer: 30,
  operation: 'subtract', countStartDay: true,
});
const diffSub = (countedSub.endDate.getTime() - baseSub.endDate.getTime()) / 86400000;
assert(diffSub === 1,
  'Count-start-day option shifts result forward by one day (subtract)',
  `base=${iso(baseSub.endDate)}, counted=${iso(countedSub.endDate)}, diff=${diffSub}`);

// ─── Tablets per day ─────────────────────────────────────────────────────────
console.log('\nTablets per day:');
r = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 1, perContainer: 30,
  tabletsPerDay: 2,
});
assert(r.days === 15 && r.remainder === 0,
  'Tablets per day = 2 turns 30 tablets into 15 days (no remainder)',
  `got days=${r.days}, remainder=${r.remainder}`);

r = dm.calculate({
  startDate: dm.makeDate(2026, 10, 8), containers: 1, perContainer: 30,
  tabletsPerDay: 4,
});
assert(r.days === 7 && r.remainder === 2,
  'Tablets per day = 4 with 30 tablets = 7 days (remainder 2, rounded down)',
  `got days=${r.days}, remainder=${r.remainder}`);

// ─── Invalid input handling ──────────────────────────────────────────────────
console.log('\nInvalid / edge inputs:');

let threw = false;
try { dm.totalTablets(0, 30); } catch(e) { threw = true; }
// totalTablets returns null rather than throwing for invalid input
assert(dm.totalTablets(0, 30) === null, 'Zero containers → null');
assert(dm.totalTablets(1, 0) === null, 'Zero tablets per container → null');
assert(dm.totalTablets(-1, 30) === null, 'Negative containers → null');
assert(dm.totalTablets(1.5, 30) === null, 'Non-integer containers → null');
assert(dm.totalTablets('abc', 30) === null, 'Non-numeric containers → null');
assert(dm.totalTablets('', 30) === null, 'Empty containers → null');
assert(dm.totalTablets(1e10, 30) === null, 'Very large (overflow) → null');

threw = false;
try {
  dm.calculate({ startDate: dm.makeDate(2026,10,8), containers: 0, perContainer: 30 });
} catch(e) { threw = true; }
assert(threw, 'Zero containers throws in calculate()');

threw = false;
try {
  dm.calculate({ startDate: dm.makeDate(2026,10,8), containers: 1, perContainer: 0 });
} catch(e) { threw = true; }
assert(threw, 'Zero per-container throws in calculate()');

// parseISODate validates real dates
assert(dm.parseISODate('2027-02-29') === null, '29 Feb 2027 (non-leap) → invalid');
assert(dm.parseISODate('2028-02-29') !== null, '29 Feb 2028 (leap) → valid');
assert(dm.parseISODate('not-a-date') === null, 'Garbage string → null');
assert(dm.parseISODate('2026-13-01') === null, 'Month 13 → null');

// Days in month
assert(dm.daysInMonth(2028, 2) === 29, 'Feb 2028 has 29 days');
assert(dm.daysInMonth(2027, 2) === 28, 'Feb 2027 has 28 days');
assert(dm.daysInMonth(2026, 12) === 31, 'Dec has 31 days');

// Today returns a valid date
const t = dm.todayUTC();
assert(t instanceof Date && !isNaN(t.getTime()), 'todayUTC() returns a valid Date');
assert(t.getUTCHours() === 0 && t.getUTCMinutes() === 0, 'todayUTC() is midnight UTC');

// Formatting sanity
const d = dm.makeDate(2026, 11, 7);
assert(dm.formatDateLong(d) === '7 November 2026', 'Long format: 7 November 2026');
assert(dm.formatDateShort(d) === '7 Nov 2026', 'Short format: 7 Nov 2026');
assert(dm.formatDateWithWeekday(d).startsWith('Saturday'), 'Weekday is Saturday');

// Round-trip ISO
assert(dm.toISODate(dm.parseISODate('2026-10-08')) === '2026-10-08', 'ISO round-trip');

// ─── APP_VERSION exists ──────────────────────────────────────────────────────
assert(typeof dm.APP_VERSION === 'string' && dm.APP_VERSION.length > 0,
  `APP_VERSION is defined (${dm.APP_VERSION})`);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failed === 0) {
  console.log(`All ${passed} tests passed.`);
} else {
  console.log(`${passed} passed, ${failed} failed:`);
  failures.forEach(f => console.log(`  ✗ ${f.name} — ${f.detail}`));
  process.exit(1);
}
console.log();
