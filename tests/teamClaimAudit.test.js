'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendTeamClaimAudit, getTeamClaimAudit, MAX_TEAM_CLAIM_AUDIT_EVENTS } = require('../utils/teamClaimAudit');

test('audit records team claims and actor details without changing unrelated dynasty fields', () => {
  const dynasty = { name: 'Test Dynasty', teamSelections: [{ team: 'Alpha' }] };
  const record = appendTeamClaimAudit(dynasty, 'team_claimed', { team: 'Alpha', userId: 'u1', username: 'Coach' }, { id: 'm1', username: 'Manager' });
  assert.equal(record.event, 'team_claimed');
  assert.equal(record.team, 'Alpha');
  assert.equal(record.userId, 'u1');
  assert.equal(record.actorName, 'Manager');
  assert.equal(dynasty.teamSelections[0].team, 'Alpha');
});

test('audit history is newest first and limit is bounded', () => {
  const dynasty = {};
  appendTeamClaimAudit(dynasty, 'one');
  appendTeamClaimAudit(dynasty, 'two');
  appendTeamClaimAudit(dynasty, 'three');
  assert.deepEqual(getTeamClaimAudit(dynasty, 2).map(x => x.event), ['three', 'two']);
  assert.equal(getTeamClaimAudit(dynasty, 500).length, 3);
});

test('audit history is capped to prevent unbounded database growth', () => {
  const dynasty = {};
  for (let i = 0; i < MAX_TEAM_CLAIM_AUDIT_EVENTS + 5; i++) appendTeamClaimAudit(dynasty, `event-${i}`);
  assert.equal(dynasty.teamClaimAudit.length, MAX_TEAM_CLAIM_AUDIT_EVENTS);
  assert.equal(getTeamClaimAudit(dynasty, 1)[0].event, `event-${MAX_TEAM_CLAIM_AUDIT_EVENTS + 4}`);
});

test('reading a dynasty without history is safe and does not mutate it', () => {
  const dynasty = { name: 'Legacy' };
  assert.deepEqual(getTeamClaimAudit(dynasty), []);
  assert.equal(Object.hasOwn(dynasty, 'teamClaimAudit'), false);
});
