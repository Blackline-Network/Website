'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'commands', 'teamnotifications.js'), 'utf8');

test('Fix 162 registers an export subcommand with outcome, event, and bounded limit filters', () => {
  assert.match(source, /setName\('export'\)/);
  assert.match(source, /setName\('outcome'\)/);
  assert.match(source, /setName\('event'\)/);
  assert.match(source, /setName\('limit'\)[\s\S]*?setMaxValue\(50\)/);
});

test('Fix 162 exports timestamp, event, outcome, reason, and error code as a CSV attachment', () => {
  assert.match(source, /const headers = \['timestamp_utc', 'event', 'outcome', 'reason', 'error_code'\]/);
  assert.match(source, /new AttachmentBuilder\(Buffer\.from\(csv, 'utf8'\)/);
  assert.match(source, /function csvCell\(value\)/);
  assert.match(source, /allowedMentions|csvCell/);
});
