'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'teamnotifications.js'), 'utf8');

test('Fix 164 registers a notification summary subcommand', () => {
  assert.match(source, /setName\('summary'\)/);
  assert.match(source, /if \(subcommand === 'summary'\)/);
});

test('Fix 164 summary includes overall counts, per-event breakdown, success rate, and latest failure', () => {
  assert.match(source, /Delivery success rate/);
  assert.match(source, /By event type/);
  assert.match(source, /Most recent retained failure/);
  assert.match(source, /health\.byEvent/);
  assert.match(source, /health\.recent\.find\(item => item\.outcome === 'failed'\)/);
});
