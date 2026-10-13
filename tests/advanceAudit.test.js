const test = require('node:test');
const assert = require('node:assert/strict');
const { phaseSnapshot, recordAdvance, recordPanelSync, getAdvanceAuditEntries } = require('../utils/advanceAudit');

test('advance audit records before and after phase with source and actor', () => {
  const dynasty = { season: 2, seasonYear: 2027, currentPhase: 'week2', currentPhaseLabel: 'Week 2' };
  const before = phaseSnapshot(dynasty);
  dynasty.currentPhase = 'week3'; dynasty.currentPhaseLabel = 'Week 3';
  recordAdvance(dynasty, { source: 'manual', actorId: '42', actorTag: 'Commissioner', from: before, at: new Date('2026-10-10T00:00:00Z') });
  const entry = getAdvanceAuditEntries(dynasty, 1)[0];
  assert.equal(entry.action, 'week-advance');
  assert.equal(entry.details.fromPhase, 'Week 2');
  assert.equal(entry.details.toPhase, 'Week 3');
  assert.equal(entry.details.source, 'manual');
  assert.equal(entry.actorId, '42');
});

test('panel refresh audit records successful and failed panel names', () => {
  const dynasty = {};
  recordPanelSync(dynasty, { refreshed: ['League Hub', 'Schedule'], failed: ['Competition Center'], ok: false }, { source: 'automatic' });
  const entry = getAdvanceAuditEntries(dynasty, 1)[0];
  assert.equal(entry.action, 'week-advance-panel-sync');
  assert.equal(entry.details.failedCount, '1');
  assert.match(entry.details.failed, /Competition Center/);
  assert.match(entry.details.refreshed, /League Hub/);
  assert.equal(entry.details.result, 'partial');
});

test('advance audit returns newest entries first and bounds requested count', () => {
  const dynasty = {};
  for (let i = 0; i < 4; i++) recordAdvance(dynasty, { source: 'automatic', from: { season: 1, seasonYear: 2026, phase: `Week ${i}` }, to: { season: 1, seasonYear: 2026, phase: `Week ${i + 1}` } });
  assert.equal(getAdvanceAuditEntries(dynasty, 2).length, 2);
  assert.equal(getAdvanceAuditEntries(dynasty, 2)[0].details.toPhase, 'Week 4');
  assert.equal(getAdvanceAuditEntries(dynasty, 100).length, 4);
});
