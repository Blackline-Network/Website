'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnoseTeamSelection } = require('../utils/teamSelectionDiagnostics');

test('team diagnostics reports a healthy panel and accurate claim counts', () => {
  const result = diagnoseTeamSelection({ game: 'custom', teamPool: ['Alpha', 'Beta', 'Gamma'], teamChannelId: 'c1', teamMessageId: 'm1', coaches: [{ userId: 'u1' }], teamSelections: [{ team: 'Alpha', userId: 'u1' }] });
  assert.equal(result.totalTeams, 3);
  assert.equal(result.claimedTeams, 1);
  assert.equal(result.availableTeams, 2);
  assert.equal(result.healthy, true);
  assert.deepEqual(result.issues, []);
});

test('team diagnostics detects invalid and duplicate team claims and multiple teams per user', () => {
  const result = diagnoseTeamSelection({ game: 'custom', teamPool: ['Alpha', 'Beta'], teamChannelId: 'c1', teamMessageId: 'm1', coaches: [{ userId: 'u1' }], teamSelections: [
    { team: 'Alpha', userId: 'u1' }, { team: ' alpha ', userId: 'u2' }, { team: 'Outside Pool', userId: 'u1' }, { team: 'Beta', userId: 'u3' }
  ] });
  assert.equal(result.duplicateTeamClaims.length, 2);
  assert.equal(result.invalidClaims.length, 1);
  assert.equal(result.multipleTeamsPerUser.length, 2);
  assert.ok(result.issues.length >= 3);
});

test('team diagnostics flags missing panel references and coach records without mutating claims', () => {
  const dynasty = { game: 'custom', teamPool: ['Alpha'], teamSelections: [{ team: 'Alpha', userId: 'u9' }] };
  const before = JSON.stringify(dynasty.teamSelections);
  const result = diagnoseTeamSelection(dynasty);
  assert.equal(result.missingChannelId, true);
  assert.equal(result.missingMessageId, true);
  assert.deepEqual(result.claimantsWithoutCoach, ['u9']);
  assert.equal(JSON.stringify(dynasty.teamSelections), before);
});
