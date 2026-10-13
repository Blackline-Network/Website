'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTeamAnalytics, validFinalGames } = require('../utils/teamAnalytics');
const makeDynasty = () => ({ scheduleGames: [
  { season: 1, week: 1, status: 'final', homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 31, awayScore: 10 },
  { season: 1, week: 2, status: 'final', homeTeam: 'Clemson', awayTeam: 'Alabama', homeScore: 17, awayScore: 24 },
  { season: 1, week: 3, status: 'final', homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 21, awayScore: 20 },
  { season: 2, week: 1, status: 'final', homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 0, awayScore: 7 },
  { season: 2, week: 2, status: 'scheduled', homeTeam: 'Alabama', awayTeam: 'Clemson' },
  { season: 2, week: 3, status: 'final', homeTeam: 'Alabama', awayTeam: 'Invalid', homeScore: 'x', awayScore: 1 }
] });
test('advanced team analytics calculates home/away splits and per-game scoring from final games only', () => {
  const a = calculateTeamAnalytics(makeDynasty(), '  ALABAMA ');
  assert.equal(a.games, 4);
  assert.deepEqual([a.overall.wins, a.overall.losses, a.overall.ties], [3, 1, 0]);
  assert.deepEqual([a.home.wins, a.home.losses, a.home.games], [2, 1, 3]);
  assert.deepEqual([a.away.wins, a.away.losses, a.away.games], [1, 0, 1]);
  assert.equal(a.overall.pointsFor, 76);
  assert.equal(a.overall.pointsAgainst, 54);
  assert.equal(a.overall.pointsPerGame, 19);
  assert.equal(a.shutouts, 0);
  assert.equal(a.oneScoreGames, 3);
});
test('analytics reports season extremes, biggest margins, and streaks deterministically', () => {
  const a = calculateTeamAnalytics(makeDynasty(), 'Alabama');
  assert.equal(a.bestSeason.season, 1);
  assert.equal(a.worstSeason.season, 2);
  assert.equal(a.biggestWin.margin, 21);
  assert.equal(a.biggestLoss.margin, -7);
  assert.deepEqual(a.currentStreak, { type: 'L', count: 1 });
  assert.equal(a.longestWinStreak, 3);
});
test('season filter, missing teams, and empty records are safe', () => {
  assert.equal(calculateTeamAnalytics(makeDynasty(), 'Alabama', 2).games, 1);
  assert.equal(calculateTeamAnalytics(makeDynasty(), 'Unknown').games, 0);
  assert.equal(calculateTeamAnalytics({}, 'Alabama').bestSeason, null);
  assert.equal(validFinalGames(makeDynasty(), '').length, 0);
});
