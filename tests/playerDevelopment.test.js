const test = require('node:test');
const assert = require('node:assert/strict');
const { setPlayerDevelopment, previewDevelopment, applyDevelopment, validateRatings } = require('../utils/playerDevelopment');
function sample() { return { season: 7, seasonClosed: true, rosterPlayers: [
  { name: 'A QB', team: 'Alpha', position: 'QB', classYear: 'JR' },
  { name: 'B CB', team: 'Beta', position: 'CB', classYear: 'SO' },
  { name: 'Unrated', team: 'Alpha', position: 'RB', classYear: 'FR' }
] }; }
test('ratings enforce ranges and potential ceiling', () => {
  assert.equal(validateRatings(88, 87), 'Potential cannot be lower than the current overall rating.');
  assert.match(validateRatings(39, 90), /40 to 99/);
  assert.equal(validateRatings(70, 90), null);
});
test('staff settings attach development to an existing player only', () => {
  const d = sample();
  assert.match(setPlayerDevelopment(d, { name: 'Missing', team: 'Alpha', overall: 60, potential: 80 }, 'staff').error, /Could not find/);
  const result = setPlayerDevelopment(d, { name: 'A QB', team: 'Alpha', overall: 80, potential: 90, focus: 'Offense' }, 'staff');
  assert.equal(result.player.development.overall, 80);
});
test('preview is read-only and calculates capped development', () => {
  const d = sample();
  setPlayerDevelopment(d, { name: 'A QB', team: 'Alpha', overall: 80, potential: 90, focus: 'Offense' }, 'staff');
  setPlayerDevelopment(d, { name: 'B CB', team: 'Beta', overall: 88, potential: 90, focus: 'Offense' }, 'staff');
  const plan = previewDevelopment(d);
  assert.equal(plan.players.find(p => p.name === 'A QB').newOverall, 83);
  assert.equal(plan.players.find(p => p.name === 'B CB').newOverall, 89);
  assert.equal(d.rosterPlayers[0].development.overall, 80);
  assert.equal(plan.unrated, 1);
});
test('apply requires closed season and is once per season', () => {
  const d = sample();
  setPlayerDevelopment(d, { name: 'A QB', team: 'Alpha', overall: 80, potential: 90, focus: 'Offense' }, 'staff');
  d.seasonClosed = false;
  assert.match(applyDevelopment(d, 'staff').error, /Close the current season/);
  d.seasonClosed = true;
  const result = applyDevelopment(d, 'staff');
  assert.equal(result.transition.playersImproved, 1);
  assert.equal(d.rosterPlayers[0].development.overall, 83);
  assert.equal(d.playerDevelopmentHistory.length, 1);
  assert.match(applyDevelopment(d, 'staff').error, /already been applied/);
});
test('players at potential do not gain rating but transition still becomes idempotent', () => {
  const d = sample();
  setPlayerDevelopment(d, { name: 'A QB', team: 'Alpha', overall: 90, potential: 90, focus: 'Offense' }, 'staff');
  const result = applyDevelopment(d, 'staff');
  assert.equal(result.transition.playersImproved, 0);
  assert.equal(d.developmentTransitions.length, 1);
});
