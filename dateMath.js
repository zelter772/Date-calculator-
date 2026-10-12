/**
 * dateMath.js — Pure date arithmetic, no DOM, no timezone surprises.
 * All dates are handled as UTC year/month/day to avoid DST and timezone drift.
 */

const APP_VERSION = '1.2.0';

/**
 * Create a UTC date at midnight (no time component to cause drift).
 * @param {number} y - full year (e.g. 2026)
 * @param {number} m - month (1–12)
 * @param {number} d - day of month
 * @returns {Date}
 */
function makeDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parse an ISO "YYYY-MM-DD" string into a UTC date at midnight.
 * Returns null if invalid.
 */
function parseISODate(str) {
  if (typeof str !== 'string') return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str.trim());
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = makeDate(y, m, d);
  // Verify the date didn't roll over (e.g. Feb 30 → Mar 2)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/**
 * Format a UTC date as "YYYY-MM-DD" (for input[type=date]).
 */
function toISODate(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get today's date in UTC (at midnight UTC).
 */
function todayUTC() {
  const now = new Date();
  return makeDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/**
 * Add N days to a date. Does not count the start day itself when adding days
 * (i.e. start + 1 day = next day). Pure day arithmetic, no millisecond math.
 * @param {Date} dt - start date (UTC)
 * @param {number} days - number of days to add (can be negative for subtraction)
 * @returns {Date}
 */
function addDays(dt, days) {
  return new Date(Date.UTC(
    dt.getUTCFullYear(),
    dt.getUTCMonth(),
    dt.getUTCDate() + days
  ));
}

/**
 * Days in a given month/year (UTC).
 */
function daysInMonth(y, m /* 1-12 */) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Add N calendar months, clamping to end-of-month when needed.
 * 31 Jan 2028 + 1 month = 29 Feb 2028 (leap year).
 * @param {Date} dt
 * @param {number} months - can be negative
 * @returns {Date}
 */
function addMonths(dt, months) {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth(); // 0-based
  const d = dt.getUTCDate();

  const totalMonths = m + months;
  const newY = y + Math.floor(totalMonths / 12);
  const newM0 = ((totalMonths % 12) + 12) % 12; // 0-based, handle negatives
  const dim = daysInMonth(newY, newM0 + 1);
  const newD = Math.min(d, dim);
  return new Date(Date.UTC(newY, newM0, newD));
}

/**
 * Compute total tablets from A containers × B tablets per container.
 */
function totalTablets(containers, perContainer) {
  const a = Number(containers);
  const b = Number(perContainer);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a <= 0 || b <= 0) return null;
  // Guard against huge values that could cause issues
  if (a > 1e9 || b > 1e9) return null;
  return a * b;
}

/**
 * Calculate days supply based on tablets and tablets-per-day.
 * Default is 1 tablet per day. Always rounds DOWN (floor) when not evenly divisible.
 * @param {number} tablets
 * @param {number} perDay
 * @returns {{ days: number, remainder: number } | null}
 */
function daysSupply(tablets, perDay) {
  const t = Number(tablets);
  const p = Number(perDay);
  if (!Number.isFinite(t) || !Number.isFinite(p)) return null;
  if (!Number.isInteger(t) || !Number.isInteger(p)) return null;
  if (t <= 0 || p <= 0) return null;
  if (t > 1e9 || p > 1e9) return null;
  const days = Math.floor(t / p);
  const remainder = t % p;
  return { days, remainder };
}

/**
 * Full calculation: given start date and parameters, return the end date.
 * 
 * @param {object} opts
 * @param {Date} opts.startDate - UTC start date
 * @param {number} opts.containers
 * @param {number} opts.perContainer
 * @param {'add'|'subtract'} [opts.operation='add']
 * @param {'days'|'months'} [opts.unit='days']
 * @param {number} [opts.tabletsPerDay=1]
 * @param {boolean} [opts.countStartDay=false] - if true, start day counts as day 1 (shift back by 1)
 * @returns {{
 *   endDate: Date,
 *   tablets: number,
 *   days: number,
 *   remainder: number,
 *   isMonths: boolean,
 *   monthsValue: number,
 *   countStartDay: boolean,
 *   operation: string
 * }}
 */
function calculate(opts) {
  const {
    startDate,
    containers,
    perContainer,
    operation = 'add',
    unit = 'days',
    tabletsPerDay = 1,
    countStartDay = false,
  } = opts;

  const tablets = totalTablets(containers, perContainer);
  if (tablets === null) throw new Error('Invalid quantity');
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) throw new Error('Invalid start date');

  let result;
  let days = 0;
  let remainder = 0;
  let monthsValue = 0;
  const isMonths = unit === 'months';

  if (isMonths) {
    // In months mode, "days" is the number of calendar months to add/subtract.
    // We use total tablets as months supply directly (each "tablet" = 1 month? No—
    // user picks unit months meaning: the period is N calendar months where N =
    // totalTablets / tabletsPerDay (floored). Practically, per day dosage doesn't
    // really apply to months, so we compute tablets per day = days and then
    // treat that figure as the number of months to shift.
    const supply = daysSupply(tablets, tabletsPerDay);
    if (supply === null) throw new Error('Invalid tablets per day');
    days = supply.days;
    remainder = supply.remainder;
    monthsValue = supply.days;
    const sign = operation === 'subtract' ? -1 : 1;
    result = addMonths(startDate, sign * monthsValue);
  } else {
    const supply = daysSupply(tablets, tabletsPerDay);
    if (supply === null) throw new Error('Invalid tablets per day');
    days = supply.days;
    remainder = supply.remainder;
    const sign = operation === 'subtract' ? -1 : 1;
    let addN = sign * days;
    result = addDays(startDate, addN);
  }

  // "Count start day as day 1" shifts result back by one day (when adding)
  // or forward by one day (when subtracting), because day 1 = start itself.
  if (countStartDay) {
    if (operation === 'add') {
      result = addDays(result, -1);
    } else {
      result = addDays(result, 1);
    }
  }

  return {
    endDate: result,
    tablets,
    days,
    remainder,
    isMonths,
    monthsValue,
    countStartDay,
    operation,
  };
}

/**
 * Format a date like "7 November 2026" with weekday: "Saturday, 7 November 2026".
 */
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const WEEKDAYS = [
  'Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'
];

function formatDateLong(dt) {
  const d = dt.getUTCDate();
  const m = MONTHS[dt.getUTCMonth()];
  const y = dt.getUTCFullYear();
  return `${d} ${m} ${y}`;
}

function formatDateWithWeekday(dt) {
  const wd = WEEKDAYS[dt.getUTCDay()];
  return `${wd}, ${formatDateLong(dt)}`;
}

/**
 * Format short date like "8 Oct 2026".
 */
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDateShort(dt) {
  const d = dt.getUTCDate();
  const m = MONTHS_SHORT[dt.getUTCMonth()];
  const y = dt.getUTCFullYear();
  return `${d} ${m} ${y}`;
}

// Export for both Node (tests) and browser.
// In browsers (no `module`), attach everything to globalThis/window.
(function attachExports() {
  const api = {
    APP_VERSION,
    makeDate,
    parseISODate,
    toISODate,
    todayUTC,
    addDays,
    addMonths,
    daysInMonth,
    totalTablets,
    daysSupply,
    calculate,
    formatDateLong,
    formatDateWithWeekday,
    formatDateShort,
    MONTHS,
    WEEKDAYS,
    MONTHS_SHORT,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    // Browser: expose each key on globalThis (and window).
    const g = typeof globalThis !== 'undefined' ? globalThis : self;
    Object.keys(api).forEach(k => { g[k] = api[k]; });
  }
})();
