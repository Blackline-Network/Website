'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeeklyLeagueAwards } = require('../utils/weeklyLeagueAwards');

function sample() {
  return { season: 4, coaches: [{ userId: 'u1', username: 'Coach A' }], teamSelections: [{ userId: 'u1', team: 'Alabama' }],
    scheduleGames: [
      { season: 4, week: 1, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 35, awayScore: 7, status: 'final' },
      { season: 4, week: 1, homeTeam: 'Auburn', awayTeam: 'LSU', homeScore: 21, awayScore: 24, status: 'final' },
      { season: 4, week: 1, homeTeam: 'Texas', awayTeam: 'Oklahoma', homeScore: 14, awayScore: 13, status: 'final' },
      { season: 4, week: 2, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 0, awayScore: 0, status: 'scheduled' },
      { season: 3, week: 5, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 100, awayScore: 0, status: 'final' }
    ] };
}

test('builds weekly award leaders from finalized games in the requested season and week', () => {
  const result = buildWeeklyLeagueAwards(sample(), { week: 1 });
  assert.equal(result.gamesPlayed, 3);
  assert.equal(result.awards.highestScoringGame.totalPoints, 45);
  assert.equal(result.awards.biggestWin.margin, 28);
  assert.equal(result.awards.closestWin.margin, 1);
  assert.equal(result.awards.coachOfTheWeek.coachName, 'Coach A');
});

test('defaults to the latest week with a finalized game and does not count scheduled games', () => {
  const result = buildWeeklyLeagueAwards(sample());
  assert.equal(result.week, 1);
  assert.equal(result.gamesPlayed, 3);
});

test('returns empty awards rather than inventing winners when no valid finalized game exists', () => {
  const result = buildWeeklyLeagueAwards({ season: 1, scheduleGames: [{ season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 9, awayScore: 0, status: 'scheduled' }] });
  assert.equal(result.gamesPlayed, 0);
  assert.equal(result.awards.highestScoringGame, null);
  assert.equal(result.awards.coachOfTheWeek, null);
});

test('rejects malformed scores and same-team fixtures', () => {
  const result = buildWeeklyLeagueAwards({ season: 1, scheduleGames: [
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'A', homeScore: 1, awayScore: 0, status: 'final' },
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: NaN, awayScore: 0, status: 'final' }
  ] });
  assert.equal(result.gamesPlayed, 0);
});
