'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getScenarioGames, simulatePlayoffScenario } = require('../utils/playoffPicture');

function fixture() {
  const teams = Array.from({ length: 16 }, (_, i) => `Team ${String(i + 1).padStart(2, '0')}`);
  return {
    season: 1,
    teamSelections: teams.map(team => ({ team })),
    rankings: teams,
    teamConferences: Object.fromEntries(teams.map((team, i) => [team, `Conference ${Math.floor(i / 4)}`])),
    scheduleGames: [
      { season: 1, week: 1, homeTeam: teams[0], awayTeam: teams[1], homeScore: 28, awayScore: 10, status: 'final' },
      { season: 1, week: 2, homeTeam: teams[14], awayTeam: teams[15], status: 'scheduled' },
      { season: 2, week: 3, homeTeam: 'Other A', awayTeam: 'Other B', status: 'scheduled' }
    ]
  };
}

test('scenario game selector lists only current-season unplayed games and keeps source indices', () => {
  const dynasty = fixture();
  const games = getScenarioGames(dynasty);
  assert.equal(games.length, 1);
  assert.equal(games[0].index, 1);
  assert.equal(games[0].homeTeam, 'Team 15');
});

test('scenario compares field outcomes without mutating the saved schedule', () => {
  const dynasty = fixture();
  const before = JSON.stringify(dynasty.scheduleGames);
  const result = simulatePlayoffScenario(dynasty, 1, 'home-win');
  assert.equal(result.ok, true);
  assert.equal(result.assumedScore, '24–21');
  assert.ok(Array.isArray(result.before));
  assert.ok(Array.isArray(result.after));
  assert.equal(JSON.stringify(dynasty.scheduleGames), before);
  assert.equal(dynasty.scheduleGames[1].status, 'scheduled');
});

test('scenario rejects invalid index, finalized game, wrong season, and unknown outcome', () => {
  const dynasty = fixture();
  assert.equal(simulatePlayoffScenario(dynasty, 1, 'invalid').ok, false);
  assert.equal(simulatePlayoffScenario(dynasty, 0, 'home-win').ok, false);
  assert.equal(simulatePlayoffScenario(dynasty, 2, 'home-win').ok, false);
  assert.equal(simulatePlayoffScenario(dynasty, 99, 'home-win').ok, false);
});
