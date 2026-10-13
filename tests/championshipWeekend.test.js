'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChampionshipWeekend, isConferenceTitleGame } = require('../utils/championshipWeekend');

test('lists explicitly tagged championship games and resolves valid final winners', () => {
  const result = buildChampionshipWeekend({ season: 4, seasonYear: 2029,
    scheduleGames: [
      { season: 4, week: 14, type: 'conference championship', conference: 'SEC', homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 31, awayScore: 24, status: 'final' },
      { season: 4, week: 14, homeTeam: 'Auburn', awayTeam: 'LSU', homeScore: 7, awayScore: 10, status: 'final' },
      { season: 3, week: 14, type: 'conference championship', homeTeam: 'A', awayTeam: 'B', homeScore: 3, awayScore: 0, status: 'final' }
    ], conferenceChampionsHistory: [{ season: 4, conference: 'SEC', champion: 'Alabama', runnerUp: 'Georgia', championScore: 31, runnerUpScore: 24 }] });
  assert.equal(result.championshipGames.length, 1);
  assert.equal(result.championshipGames[0].winner, 'Alabama');
  assert.equal(result.recordedTitles[0].score, '31–24');
  assert.equal(result.finalizedChampionshipGames, 1);
  assert.equal(result.seasonYear, 2029);
});

test('does not infer conference title games from ordinary games or standings', () => {
  const result = buildChampionshipWeekend({ season: 1, teamConferences: { A: 'East', B: 'East' }, scheduleGames: [
    { season: 1, week: 8, homeTeam: 'A', awayTeam: 'B', homeScore: 21, awayScore: 14, status: 'final' }
  ] });
  assert.equal(result.championshipGames.length, 0);
  assert.equal(result.recordedTitles.length, 0);
});

test('supports explicit championship boolean flags and handles unfinalized fixtures', () => {
  assert.equal(isConferenceTitleGame({ isConferenceChampionship: true }), true);
  const result = buildChampionshipWeekend({ season: 2, scheduleGames: [
    { season: 2, week: 14, isConferenceChampionship: true, homeTeam: 'A', awayTeam: 'B', status: 'scheduled' }
  ] });
  assert.equal(result.scheduledChampionshipGames, 1);
  assert.equal(result.championshipGames[0].winner, null);
});

test('rejects invalid final score data for winner determination', () => {
  const result = buildChampionshipWeekend({ season: 2, scheduleGames: [
    { season: 2, type: 'conference championship', homeTeam: 'A', awayTeam: 'B', homeScore: '21', awayScore: 7, status: 'final' }
  ] });
  assert.equal(result.championshipGames[0].status, 'invalid result');
  assert.equal(result.championshipGames[0].winner, null);
});
