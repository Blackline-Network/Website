'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRivalryWeek } = require('../utils/rivalryWeek');

test('rivalry week includes scheduled current-season games for known rival pairs', () => {
  const result = buildRivalryWeek({ season: 3, scheduleGames: [
    { season: 1, week: 12, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 28, awayScore: 21, status: 'final' },
    { season: 3, week: 13, homeTeam: 'Auburn', awayTeam: 'Alabama', status: 'scheduled' },
    { season: 3, week: 8, homeTeam: 'Georgia', awayTeam: 'Florida', status: 'scheduled' },
    { season: 2, week: 14, homeTeam: 'Alabama', awayTeam: 'Auburn', status: 'scheduled' },
  ] });
  assert.equal(result.season, 3);
  assert.equal(result.trackedRivalries, 1);
  assert.equal(result.upcoming.length, 1);
  assert.equal(result.upcoming[0].homeTeam, 'Auburn');
  assert.equal(result.upcoming[0].teamAWins + result.upcoming[0].teamBWins, 1);
  assert.equal(result.upcoming[0].priorGames, 1);
});

test('rivalry week ignores scheduled matchups without recorded head-to-head history', () => {
  const result = buildRivalryWeek({ season: 1, scheduleGames: [
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', status: 'scheduled' },
    { season: 1, week: 2, homeTeam: 'C', awayTeam: 'D', homeScore: 7, awayScore: 0, status: 'final' },
    { season: 1, week: 3, homeTeam: 'C', awayTeam: 'D', status: 'scheduled' }
  ] });
  assert.equal(result.trackedRivalries, 1);
  assert.equal(result.upcoming.length, 1);
  assert.equal(result.upcoming[0].homeTeam, 'C');
});

test('rivalry week handles missing schedules and filters malformed/self-match rows', () => {
  assert.deepEqual(buildRivalryWeek({ season: 4 }).upcoming, []);
  const result = buildRivalryWeek({ season: 4, scheduleGames: [
    { season: 4, week: 1, homeTeam: 'A', awayTeam: 'A', status: 'scheduled' },
    { season: 4, week: 2, homeTeam: '', awayTeam: 'B', status: 'scheduled' }
  ] });
  assert.deepEqual(result.upcoming, []);
});
