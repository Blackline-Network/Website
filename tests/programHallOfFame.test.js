'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProgramHallOfFame } = require('../utils/programHallOfFame');

function sample(overrides = {}) {
  return {
    season: 2,
    teamSelections: [{ team: 'Alpha' }, { team: 'Beta' }],
    scheduleGames: [
      { season: 1, week: 1, status: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 31, awayScore: 14 },
      { season: 2, week: 1, status: 'final', homeTeam: 'Beta', awayTeam: 'Alpha', homeScore: 10, awayScore: 24 },
      { season: 2, week: 2, status: 'scheduled', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: null, awayScore: null }
    ],
    championshipHistory: [{ season: 1, champion: 'Alpha' }],
    conferenceChampionsHistory: [{ season: 1, conference: 'SEC', champion: 'Alpha' }],
    heismanHistory: [{ season: 1, winner: 'Player A', team: 'Alpha' }],
    draftHistory: [{ season: 2, player: 'Player B', team: 'Alpha' }],
    awardHistory: [{ season: 1, award: 'Coach Award', team: 'Alpha' }],
    playoffBracket: { season: 2, champion: 'Alpha', rounds: [{ name: 'Final', games: [
      { status: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 28, awayScore: 17 }
    ] }] },
    seasonArchives: [{ season: 1, champion: 'Beta', playoffBracket: { season: 1, champion: 'Beta', rounds: [{ name: 'Final', games: [
      { status: 'final', homeTeam: 'Beta', awayTeam: 'Alpha', homeScore: 21, awayScore: 14 }
    ] }] } }],
    ...overrides
  };
}

test('ranks programs using recorded titles, playoff success, and awards with transparent points', () => {
  const result = buildProgramHallOfFame(sample());
  const alpha = result.programs.find(row => row.team === 'Alpha');
  assert.equal(result.programs[0].team, 'Alpha');
  assert.equal(alpha.nationalTitles, 1);
  assert.equal(alpha.conferenceTitles, 1);
  assert.equal(alpha.playoffAppearances, 2);
  assert.equal(alpha.playoffWins, 1);
  assert.equal(alpha.heismanWinners, 1);
  assert.equal(alpha.draftPicks, 1);
  assert.equal(alpha.otherAwards, 1);
  assert.equal(alpha.points, 27.5);
  assert.match(result.scoring, /national title 12/i);
});

test('scheduled and malformed games do not affect overall record or winning seasons', () => {
  const result = buildProgramHallOfFame(sample({
    scheduleGames: [
      { season: 2, status: 'scheduled', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: null, awayScore: null },
      { season: 2, status: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: NaN, awayScore: 3 }
    ], playoffBracket: null, seasonArchives: [], championshipHistory: [], conferenceChampionsHistory: [], heismanHistory: [], draftHistory: [], awardHistory: []
  }));
  const alpha = result.programs.find(row => row.team === 'Alpha');
  assert.equal(alpha.overallRecord.games, 0);
  assert.equal(alpha.winningSeasons, 0);
  assert.equal(alpha.points, 0);
});

test('programs present only in saved awards are included', () => {
  const result = buildProgramHallOfFame(sample({ teamSelections: [], scheduleGames: [], championshipHistory: [], conferenceChampionsHistory: [], heismanHistory: [], draftHistory: [{ season: 1, player: 'Player C', team: 'Gamma' }], awardHistory: [], playoffBracket: null, seasonArchives: [] }));
  assert.ok(result.programs.some(row => row.team === 'Gamma'));
});

test('empty league history returns an explicit empty result without inventing programs', () => {
  const result = buildProgramHallOfFame({ season: 1, scheduleGames: [], teamSelections: [], championshipHistory: [], conferenceChampionsHistory: [], heismanHistory: [], draftHistory: [], awardHistory: [], seasonArchives: [], playoffBracket: null });
  assert.equal(result.programsReviewed, 0);
  assert.equal(result.programs.length, 0);
  assert.match(result.note, /Missing history is not inferred/i);
});
