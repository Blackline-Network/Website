'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDynastyAlmanac } = require('../utils/dynastyAlmanac');

test('dynasty almanac aggregates recorded league coverage and highlights', () => {
  const result = buildDynastyAlmanac({
    season: 3,
    coaches: [{ userId: '1', username: 'Coach A' }],
    teamSelections: [{ team: 'Alpha' }, { team: 'Beta' }],
    scheduleGames: [
      { season: 1, week: 1, status: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 21, awayScore: 14 },
      { season: 2, week: 1, status: 'scheduled', homeTeam: 'Alpha', awayTeam: 'Beta' }
    ],
    championshipHistory: [{ season: 1, champion: 'Alpha', runnerUp: 'Beta' }],
    conferenceChampionsHistory: [{ season: 1, conference: 'East', champion: 'Beta' }],
    heismanHistory: [{ season: 1, winner: 'Player One', team: 'Alpha' }],
    awardHistory: [{ season: 2, award: 'Best QB', winner: 'Player One', team: 'Alpha' }],
    draftHistory: [{ season: 2, player: 'Player One', team: 'Alpha' }],
    recruitingProspects: [{ season: 2, team: 'Alpha', name: 'Prospect One', status: 'signed', stars: 5 }]
  });
  assert.equal(result.coverage.finalizedGames, 1);
  assert.equal(result.coverage.nationalTitles, 1);
  assert.equal(result.coverage.conferenceTitles, 1);
  assert.equal(result.coverage.awardRecords, 2);
  assert.equal(result.highlights.latestChampion.team, 'Alpha');
  assert.equal(result.highlights.mostDecoratedRecipient.name, 'Player One');
  assert.ok(result.note.includes('Missing history is not inferred'));
});

test('dynasty almanac safely handles empty data without inventing records', () => {
  const result = buildDynastyAlmanac({});
  assert.equal(result.coverage.finalizedGames, 0);
  assert.equal(result.coverage.nationalTitles, 0);
  assert.equal(result.highlights.latestChampion, null);
  assert.equal(result.highlights.allTimeProgramLeader, null);
});
