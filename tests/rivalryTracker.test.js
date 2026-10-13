'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRivalryTracker } = require('../utils/rivalryTracker');

test('rivalry tracker aggregates completed games across seasons regardless of home order', () => {
  const rows = buildRivalryTracker({ scheduleGames: [
    { season: 1, week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 28, awayScore: 21, status: 'final' },
    { season: 2, week: 4, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 17, awayScore: 24, status: 'final' },
    { season: 2, week: 7, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 14, awayScore: 14, status: 'final' },
    { season: 2, week: 8, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 99, awayScore: 0, status: 'scheduled' },
    { season: 2, week: 9, homeTeam: 'Alabama', awayTeam: 'Alabama', homeScore: 10, awayScore: 0, status: 'final' }
  ] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 3);
  assert.equal(rows[0].teamAWins, 2);
  assert.equal(rows[0].teamBWins, 0);
  assert.equal(rows[0].ties, 1);
  assert.equal(rows[0].latest.winner, 'Tie');
  assert.equal(rows[0].seasons.length, 2);
});

test('rivalry tracker ignores invalid, unplayed, and self-match games', () => {
  assert.deepEqual(buildRivalryTracker({ scheduleGames: [
    { homeTeam: 'A', awayTeam: 'B', homeScore: 1, awayScore: 0, status: 'scheduled' },
    { homeTeam: 'A', awayTeam: 'B', homeScore: '1', awayScore: 0, status: 'final' },
    { homeTeam: 'A', awayTeam: 'A', homeScore: 1, awayScore: 0, status: 'final' }
  ] }), []);
});

test('rivalry tracker calculates current streak from most recent consecutive wins', () => {
  const rows = buildRivalryTracker({ scheduleGames: [
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 7, awayScore: 3, status: 'final' },
    { season: 1, week: 2, homeTeam: 'B', awayTeam: 'A', homeScore: 10, awayScore: 14, status: 'final' },
    { season: 2, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 21, awayScore: 7, status: 'final' }
  ] });
  assert.equal(rows[0].streak.side, 'A');
  assert.equal(rows[0].streak.count, 3);
});
