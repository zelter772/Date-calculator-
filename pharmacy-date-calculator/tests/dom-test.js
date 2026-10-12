#!/usr/bin/env node
/**
 * Minimal DOM shim test for app.js (no external deps).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dm = require(path.join(__dirname, '..', 'dateMath.js'));

class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this._attrs = {};
    this._listeners = {};
    this._value = '';
    this._checked = false;
    this._hidden = false;
    this._textContent = '';
    this.classList = new ClassList();
    this.style = {};
    this.dataset = {};
    this.parentNode = null;
  }
  getAttribute(k) { return this._attrs[k]; }
  setAttribute(k, v) { this._attrs[k] = v; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  removeEventListener() {}
  dispatchEvent(ev) {
    ev.preventDefault = ev.preventDefault || function() { this.defaultPrevented = true; };
    const fns = this._listeners[ev.type] || [];
    fns.forEach(f => f(ev));
    return !ev.defaultPrevented;
  }
  focus() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  get offsetWidth() { return 100; }
  click() { this.dispatchEvent({ type: 'click' }); }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  get checked() { return this._checked; }
  set checked(v) { this._checked = !!v; }
  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = !!v; }
  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }
  closest(sel) {
    if (typeof sel === 'string' && sel.startsWith('[data-close-result]')) {
      return this.hasAttribute && this.hasAttribute('data-close-result') ? this : null;
    }
    return null;
  }
  hasAttribute(k) { return !!this._attrs[k]; }
  querySelector() { return null; }
}
class ClassList {
  constructor() { this.s = new Set(); }
  add(c) { this.s.add(c); }
  remove(c) { this.s.delete(c); }
  toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }
  contains(c) { return this.s.has(c); }
}
class Doc {
  constructor() {
    this._byId = {};
    this.documentElement = new El('html');
    this.documentElement._attrs = {};
    this.documentElement.removeAttribute = function(k) { delete this._attrs[k]; };
    this.documentElement.setAttribute = function(k, v) { this._attrs[k] = v; };
    this.body = new El('body');
    this.readyState = 'complete';
    this._listeners = {};
  }
  getElementById(id) { return this._byId[id] || null; }
  querySelectorAll(sel) {
    const pseudo = sel.includes(':checked');
    const base = sel.replace(':checked', '');
    let results;
    if (base.startsWith('input[name="')) {
      const name = base.match(/name="([^"]+)"/)[1];
      const vm2 = base.match(/value="([^"]+)"/);
      const val = vm2 ? vm2[1] : null;
      results = Object.values(this._byId).filter(e => e._attrs && e._attrs.name === name && (!val || e._value === val));
    } else if (base === '.chip') {
      results = Object.values(this._byId).filter(e => e.classList.contains('chip'));
    } else {
      results = [];
    }
    if (pseudo) results = results.filter(r => r._checked);
    return results;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  createElement(tag) { return new El(tag); }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
}

function build() {
  const doc = new Doc();
  const ids = [
    'calcForm','startDate','startWeekday','todayBtn','countStartCheck',
    'containers','perContainer','calcBtn','errorArea',
    'resultOverlay','resultCard',
    'resultWeekday','resultDate','resultProof','resultNote',
    'advancedToggle','advancedPanel','tabletsPerDay','themeSelect',
    'versionTag','unitHint','hideProofCheck','updateBanner','updateBtn',
    'historySection','historyList','clearHistoryBtn','main',
  ];
  ids.forEach(id => {
    const tag = id.includes('Btn') ? 'button' :
                id === 'calcForm' ? 'form' :
                id === 'historyList' ? 'ul' :
                ['startDate','containers','perContainer','tabletsPerDay','themeSelect','countStartCheck'].includes(id) ? 'input' :
                'div';
    doc._byId[id] = new El(tag, id);
  });
  doc.getElementById('calcForm').tagName = 'FORM';
  [30,60,90].forEach(n => {
    const c = new El('button');
    c.classList.add('chip');
    c.dataset.perContainer = String(n);
    doc._byId['chip'+n] = c;
  });
  (['add','subtract']).forEach(v => {
    const r = new El('input'); r._attrs.name = 'operation'; r._value = v;
    doc._byId['op-'+v] = r;
  });
  doc._byId['op-add']._checked = true;
  (['days','months']).forEach(v => {
    const r = new El('input'); r._attrs.name = 'unit'; r._value = v;
    doc._byId['unit-'+v] = r;
  });
  doc._byId['unit-days']._checked = true;

  const ls = {};
  const env = {
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    matchMedia: () => ({ matches: false, addListener(){}, removeListener(){} }),
  };
  return { doc, env, localStorage: { getItem(k){return ls[k]||null;}, setItem(k,v){ls[k]=String(v);}, removeItem(k){delete ls[k];} }, ls };
}

function run(ctx) {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const env = ctx.env;
  Object.assign(env, {
    APP_VERSION: dm.APP_VERSION, makeDate: dm.makeDate, parseISODate: dm.parseISODate,
    toISODate: dm.toISODate, todayUTC: dm.todayUTC, calculate: dm.calculate,
    formatDateLong: dm.formatDateLong, formatDateWithWeekday: dm.formatDateWithWeekday,
    formatDateShort: dm.formatDateShort,
  });
  const sb = {
    window: env, self: env, document: ctx.doc, localStorage: ctx.localStorage,
    navigator: { serviceWorker: { register: () => Promise.resolve({ waiting: null, installing: null, addEventListener(){} }), addEventListener(){} } },
    location: { protocol: 'https:', hostname: 'example.com' },
    setTimeout, clearTimeout, console, Math, Date, JSON, Object, Array, String,
    Number, Boolean, Error, RegExp, parseInt, parseFloat, isNaN, isFinite,
    requestAnimationFrame: (f)=>f(), Event: class {}, matchMedia: env.matchMedia,
    addEventListener: env.addEventListener.bind(env),
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(appJs, sb);
  return sb;
}

let passed = 0, failed = 0;
function assert(cond, name, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}  ${detail||''}`); }
}

console.log('DOM / UI tests:\n');

{
  const e = build(); run(e); const d = e.doc;
  assert(d.getElementById('containers').value === '1', 'Default containers = 1');
  assert(d.getElementById('perContainer').value === '30', 'Default perContainer = 30');
  assert(d.getElementById('startDate').value === dm.toISODate(dm.todayUTC()), 'Default date = today (UTC)');
  assert(d.getElementById('countStartCheck').checked === false, 'Count start day defaults to off');
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('chip60').dispatchEvent({ type: 'click' });
  assert(d.getElementById('perContainer').value === '60', 'Chip 60 sets perContainer to 60');
  assert(d.getElementById('chip60').classList.contains('active'), 'Chip 60 marked active');
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2026-10-08';
  d.getElementById('containers').value = '1';
  d.getElementById('perContainer').value = '30';
  d.getElementById('calcForm').dispatchEvent({ type: 'submit', preventDefault(){} });
  assert(d.getElementById('resultOverlay').classList.contains('open'), 'Result overlay opens after submit');
  assert(d.getElementById('resultDate').textContent === '7 November 2026',
    '8 Oct + 30d = 7 November 2026', `got "${d.getElementById('resultDate').textContent}"`);
  assert(/1\u00d730 = 30 tabs/.test(d.getElementById('resultProof').textContent),
    'Proof line shows "1x30 = 30 tabs"');
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2026-10-08';
  d.getElementById('containers').value = '';
  d.getElementById('perContainer').value = '30';
  d.getElementById('calcForm').dispatchEvent({ type: 'submit', preventDefault(){} });
  assert(!d.getElementById('errorArea').hidden, 'Error shown for empty containers');
  assert(!d.getElementById('resultOverlay').classList.contains('open'), 'Result overlay stays closed on error');
  assert(!/NaN|undefined/.test(d.getElementById('errorArea').textContent), 'Error is friendly');
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2026-10-08';
  d.getElementById('containers').value = '1';
  d.getElementById('perContainer').value = '30';
  d.getElementById('containers').dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault(){} });
  assert(d.getElementById('resultOverlay').classList.contains('open'), 'Enter in containers triggers calculation');
  assert(d.getElementById('resultDate').textContent === '7 November 2026',
    'Enter key gives correct result');
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2026-10-08';
  d.getElementById('containers').value = '1';
  d.getElementById('perContainer').value = '30';
  d.getElementById('tabletsPerDay').value = '2';
  d.getElementById('calcForm').dispatchEvent({ type: 'submit', preventDefault(){} });
  assert(d.getElementById('resultDate').textContent === '23 October 2026',
    '30 tabs at 2/day = 15d -> 23 Oct 2026', `got "${d.getElementById('resultDate').textContent}"`);
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2000-01-01';
  d.getElementById('todayBtn').dispatchEvent({ type: 'click' });
  assert(d.getElementById('startDate').value === dm.toISODate(dm.todayUTC()), 'Today button resets date');
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2026-10-08';
  d.getElementById('containers').value = '1';
  d.getElementById('perContainer').value = '30';
  d.getElementById('countStartCheck').checked = true;
  d.getElementById('calcForm').dispatchEvent({ type: 'submit', preventDefault(){} });
  assert(d.getElementById('resultDate').textContent === '6 November 2026',
    'Count start day shifts result to 6 Nov 2026', `got "${d.getElementById('resultDate').textContent}"`);
}

{
  const e = build(); run(e); const d = e.doc;
  d.getElementById('startDate').value = '2028-03-01';
  d.getElementById('containers').value = '1';
  d.getElementById('perContainer').value = '1';
  d.getElementById('op-add')._checked = false;
  d.getElementById('op-subtract')._checked = true;
  d.getElementById('calcForm').dispatchEvent({ type: 'submit', preventDefault(){} });
  assert(d.getElementById('resultDate').textContent === '29 February 2028',
    '1 Mar 2028 - 1d = 29 Feb 2028', `got "${d.getElementById('resultDate').textContent}"`);
}

{
  const e = build(); run(e);
  assert(e.doc.getElementById('versionTag').textContent === dm.APP_VERSION,
    `Version tag = ${dm.APP_VERSION}`);
}

console.log(`\n${'\u2500'.repeat(60)}`);
if (failed === 0) console.log(`All ${passed} DOM tests passed.`);
else { console.log(`${passed} passed, ${failed} failed.`); process.exit(1); }
console.log();
