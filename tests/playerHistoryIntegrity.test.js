'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditPlayerHistory, playerHistoryAuditSummary } = require('../utils/playerHistoryIntegrity');

test('clean player history has no findings', () => {
  const result = auditPlayerHistory({ draftHistory: [{ season: 1, player: 'Jordan Smith', team: 'Alabama' }], heismanHistory: [{ season: 1, winner: 'Taylor', team: 'Georgia' }] });
  assert.deepEqual(result.counts, { errors: 0, warnings: 0 });
});
test('invalid season is an error', () => {
  const result = auditPlayerHistory({ draftHistory: [{ season: 0, player: 'Jordan', team: 'Alabama' }] });
  assert.equal(result.counts.errors, 1);
  assert.equal(result.findings[0].code, 'invalid-season');
});
test('missing draft team is warned', () => {
  const result = auditPlayerHistory({ draftHistory: [{ season: 2, player: 'Jordan' }] });
  assert.ok(result.findings.some(f => f.code === 'draft-missing-team'));
});
test('duplicate-looking draft records are reported without modifying data', () => {
  const data = { draftHistory: [{ season: 3, player: 'Jordan Smith', team: 'Alabama' }, { season: 3, player: ' jordan   smith ', team: 'alabama' }] };
  const before = JSON.stringify(data);
  const result = auditPlayerHistory(data);
  assert.ok(result.findings.some(f => f.code === 'duplicate-record'));
  assert.equal(JSON.stringify(data), before);
});
test('award identity includes award type', () => {
  const result = auditPlayerHistory({ awardHistory: [{ season: 1, winner: 'Alex', team: 'A', award: 'Best QB' }, { season: 1, winner: 'Alex', team: 'A', award: 'Best DB' }] });
  assert.equal(result.findings.filter(f => f.code === 'duplicate-record').length, 0);
});
test('summary handles clean audit', () => {
  assert.equal(playerHistoryAuditSummary({ findings: [] }), 'No player-history integrity issues found.');
});
