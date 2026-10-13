'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachOfYearRace } = require('../utils/coachOfYear');

function sample() {
  return { season: 4,
    coaches: [{ userId: 'a', username: 'Coach Alpha' }, { userId: 'b', username: 'Coach Beta' }],
    teamSelections: [{ userId: 'a', team: 'Alabama' }, { userId: 'b', team: 'Auburn' }],
    scheduleGames: [
      { season: 4, week: 1, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 31, awayScore: 10, status: 'final' },
      { season: 4, week: 1, homeTeam: 'Auburn', awayTeam: 'Florida', homeScore: 7, awayScore: 14, status: 'final' },
      { season: 4, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 10, awayScore: 24, status: 'final' },
      { season: 4, week: 3, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 0, awayScore: 0, status: 'scheduled' },
      { season: 3, week: 4, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 99, awayScore: 0, status: 'final' }
    ] };
}

test('builds a cumulative coach race from registered coaches and finalized current-season games', () => {
  const result = buildCoachOfYearRace(sample());
  assert.equal(result.gamesCounted, 3);
  assert.equal(result.leaderboard[0].coachName, 'Coach Alpha');
  assert.equal(result.leaderboard[0].wins, 2);
  assert.equal(result.leaderboard[0].games, 2);
  assert.equal(result.leaderboard[1].losses, 2);
});

test('does not count scheduled games or other seasons', () => {
  const dynasty = sample();
  dynasty.scheduleGames = dynasty.scheduleGames.filter(g => g.status === 'scheduled' || g.season !== 4);
  const result = buildCoachOfYearRace(dynasty);
  assert.equal(result.gamesCounted, 0);
  assert.deepEqual(result.leaderboard, []);
});

test('requires a registered coach and recorded team assignment', () => {
  const dynasty = sample();
  dynasty.coaches = [];
  const result = buildCoachOfYearRace(dynasty);
  assert.deepEqual(result.leaderboard, []);
});

test('returns explicit scoring rules and bounded leaderboard size', () => {
  const result = buildCoachOfYearRace(sample(), { limit: 100 });
  assert.match(result.scoring, /10 base points/);
  assert.ok(result.leaderboard.length <= 25);
});
