'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendAuditEntry, formatAuditEntry, safeTimestamp } = require('../utils/operations');

test('audit entries preserve actor, action, and safe scalar details', () => {
  const dynasty = {};
  const entry = appendAuditEntry(dynasty, {
    action: 'history-recorded', actorId: '123', actorTag: 'Staff#0001',
    details: { season: 3, winner: 'Alabama', ignored: { token: 'nope' } }
  }, new Date('2026-10-09T18:00:00.000Z'));
  assert.equal(dynasty.staffAuditLog.length, 1);
  assert.equal(entry.actorId, '123');
  assert.equal(entry.details.season, '3');
  assert.equal(entry.details.ignored, undefined);
  assert.match(formatAuditEntry(entry), /history-recorded/);
  assert.match(formatAuditEntry(entry), /Alabama/);
});
test('audit log is capped to the most recent 500 entries', () => {
  const dynasty = { staffAuditLog: Array.from({ length: 500 }, (_, i) => ({ action: `old-${i}` })) };
  appendAuditEntry(dynasty, { action: 'new', actorId: '1' });
  assert.equal(dynasty.staffAuditLog.length, 500);
  assert.equal(dynasty.staffAuditLog.at(-1).action, 'new');
  assert.equal(dynasty.staffAuditLog[0].action, 'old-1');
});
test('backup timestamp is filesystem-safe and deterministic', () => {
  assert.equal(safeTimestamp(new Date('2026-10-09T18:20:30.123Z')), '2026-10-09T18-20-30-123Z');
});

test('championship score validation blocks mismatched, tied, reversed, or incomplete scores', () => {
  const { validateChampionScore } = require('../utils/operations');
  assert.match(validateChampionScore('Alabama', 'Georgia', 24, null), /both final scores/);
  assert.match(validateChampionScore('Alabama', 'Georgia', 20, 20), /cannot end tied/);
  assert.match(validateChampionScore('Alabama', 'Georgia', 17, 24), /champion score must be greater/);
  assert.match(validateChampionScore('Alabama', null, 31, 17), /runner-up team/);
  assert.match(validateChampionScore('Alabama', 'Alabama', 31, 17), /different teams/);
  assert.equal(validateChampionScore('Alabama', 'Georgia', 31, 17), null);
  assert.equal(validateChampionScore('Alabama', null, null, null), null);
});

test('audit formatter emits clean Discord-readable text', () => {
  const { formatAuditEntry } = require('../utils/operations');
  const line = formatAuditEntry({ at: '2026-10-09T18:00:00.000Z', action: 'game-result-corrected', actorId: '123', details: { previous: '7-3', correctedTo: '10-7' } });
  assert.match(line, /game-result-corrected/);
  assert.match(line, /previous: 7-3/);
  assert.doesNotMatch(line, /\x1b/);
});
