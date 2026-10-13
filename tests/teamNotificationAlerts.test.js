'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'teamnotifications.js'), 'utf8');

test('Fix 165 registers a manager notification alerts subcommand', () => {
  assert.match(source, /setName\('alerts'\)/);
  assert.match(source, /if \(subcommand === 'alerts'\)/);
});

test('Fix 165 checks retained recent failures and reports configuration state', () => {
  assert.match(source, /health\.recent\.slice\(0, 10\)/);
  assert.match(source, /TEAM_CLAIM_ALERT_FAILURE_THRESHOLD/);
  assert.match(source, /health\.configured/);
  assert.match(source, /latestFailure/);
  assert.match(source, /does not send proactive alerts/);
});
