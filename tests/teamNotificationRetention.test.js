'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'teamnotifications.js'), 'utf8');
const util = fs.readFileSync(path.join(__dirname, '..', 'utils', 'teamClaimNotifications.js'), 'utf8');

test('Fix 163 registers retention controls with bounded limits', () => {
  assert.match(source, /setName\('retention'\)/);
  assert.match(source, /setMinValue\(MIN_HEALTH_LIMIT\)/);
  assert.match(source, /setMaxValue\(MAX_HEALTH_LIMIT\)/);
  assert.match(source, /setNotificationRetentionLimit\(requestedLimit\)/);
});

test('Fix 163 persists configurable retention and trims history to the selected limit', () => {
  assert.match(util, /team-notification-retention\.json/);
  assert.match(util, /const MIN_HEALTH_LIMIT = 10/);
  assert.match(util, /const MAX_HEALTH_LIMIT = 500/);
  assert.match(util, /health\.recent\.length > healthLimit/);
  assert.match(util, /persistHealth\(\)/);
});
