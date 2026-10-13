
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNationalChampionshipExperience, isNationalTitleGame } = require('../utils/nationalChampionshipExperience');

test('uses explicit national championship fixtures and valid final scores', () => {
  const result = buildNationalChampionshipExperience({ season: 5, seasonYear: 2030,
    scheduleGames: [
      { season: 5, week: 16, type: 'national championship', homeTeam: 'Alabama', awayTeam: 'Oregon', homeScore: 34, awayScore: 27, status: 'final' },
      { season: 5, week: 15, homeTeam: 'Georgia', awayTeam: 'Texas', homeScore: 20, awayScore: 10, status: 'final' },
      { season: 4, week: 16, type: 'national championship', homeTeam: 'A', awayTeam: 'B', homeScore: 10, awayScore: 7, status: 'final' }
    ], championshipHistory: [{ season: 5, champion: 'Alabama', runnerUp: 'Oregon', championScore: 34, runnerUpScore: 27 }] });
  assert.equal(result.games.length, 1);
  assert.equal(result.games[0].champion, 'Alabama');
  assert.equal(result.games[0].runnerUp, 'Oregon');
  assert.equal(result.history[0].score, '34–27');
  assert.equal(result.seasonYear, 2030);
});

test('does not infer title game from ordinary playoff games or standings', () => {
  const result = buildNationalChampionshipExperience({ season: 2, scheduleGames: [
    { season: 2, round: 'semifinal', homeTeam: 'A', awayTeam: 'B', homeScore: 20, awayScore: 7, status: 'final' }
  ], playoffPicture: [{ team: 'A', seed: 1 }] });
  assert.equal(result.games.length, 0);
  assert.equal(result.history.length, 0);
});

test('supports explicit flags and keeps unfinalized games winnerless', () => {
  assert.equal(isNationalTitleGame({ isNationalChampionship: true }), true);
  const result = buildNationalChampionshipExperience({ season: 3, scheduleGames: [
    { season: 3, isNationalChampionship: true, homeTeam: 'A', awayTeam: 'B', status: 'scheduled' }
  ] });
  assert.equal(result.games[0].status, 'scheduled');
  assert.equal(result.games[0].champion, null);
});

test('rejects string scores and final ties as champion determinations', () => {
  const result = buildNationalChampionshipExperience({ season: 3, scheduleGames: [
    { season: 3, type: 'national championship', homeTeam: 'A', awayTeam: 'B', homeScore: '28', awayScore: 21, status: 'final' },
    { season: 3, type: 'CFP championship', homeTeam: 'C', awayTeam: 'D', homeScore: 14, awayScore: 14, status: 'final' }
  ] });
  assert.equal(result.games[0].status, 'invalid result');
  assert.equal(result.games[0].champion, null);
  assert.equal(result.games[1].status, 'tie');
  assert.equal(result.games[1].champion, null);
});
