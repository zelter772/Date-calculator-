#!/usr/bin/env node
/** Runs both test suites. */
'use strict';
const { execSync } = require('child_process');
const path = require('path');

const tests = [
  path.join(__dirname, 'run-tests.js'),
  path.join(__dirname, 'dom-test.js'),
];

let failed = 0;
for (const t of tests) {
  try {
    const out = execSync(`node "${t}"`, { encoding: 'utf8', stdio: 'pipe' });
    process.stdout.write(out);
  } catch (e) {
    process.stdout.write(e.stdout);
    process.stderr.write(e.stderr);
    failed++;
  }
}
if (failed > 0) {
  console.error(`\n${failed} test suite(s) failed.`);
  process.exit(1);
}
console.log('\n' + '='.repeat(60));
console.log('All test suites passed.');
