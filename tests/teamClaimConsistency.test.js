'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { claimTeam, releaseTeam, getTakenTeam, getCoachTeam } = require('../utils/teams');
function dynasty() { return { game: 'ncaa', teamSelections: [] }; }
test('claim stores canonical pool name even when user input casing differs', () => {
  const d = dynasty();
  assert.equal(claimTeam(d, '  aLaBaMa ', { id: '123', username: 'Coach' }).success, true);
  assert.equal(d.teamSelections[0].team, 'Alabama');
});
test('normalized duplicate claim is rejected as taken', () => {
  const d = { game: 'ncaa', teamSelections: [{ team: ' Alabama ', userId: '456' }] };
  assert.equal(claimTeam(d, 'ALABAMA', { id: '123', username: 'Coach' }).reason, 'taken');
  assert.equal(getTakenTeam(d, 'alabama').userId, '456');
});
test('same coach cannot claim a second team regardless of user ID type', () => {
  const d = { game: 'ncaa', teamSelections: [{ team: 'Alabama', userId: '123' }] };
  assert.equal(getCoachTeam(d, 123).team, 'Alabama');
  assert.equal(claimTeam(d, 'Auburn', { id: 123, username: 'Coach' }).reason, 'already_has_team');
});
test('release matches normalized team names', () => {
  const d = { game: 'ncaa', teamSelections: [{ team: ' Alabama ', userId: '123' }] };
  assert.equal(releaseTeam(d, 'ALABAMA'), true);
  assert.equal(d.teamSelections.length, 0);
});
test('claim rejects a missing user ID', () => {
  assert.equal(claimTeam(dynasty(), 'Alabama', {}).reason, 'invalid_user');
});
