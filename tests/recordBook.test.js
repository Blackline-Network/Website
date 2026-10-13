'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDynastyRecordBook, validFinalGames } = require('../utils/recordBook');

function sample(overrides = {}) {
  return {
    scheduleGames: [
      { season: 1, week: 1, status: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 42, awayScore: 7 },
      { season: 1, week: 2, status: 'final', homeTeam: 'Beta', awayTeam: 'Alpha', homeScore: 14, awayScore: 21 },
      { season: 2, week: 1, status: 'final', homeTeam: 'Gamma', awayTeam: 'Alpha', homeScore: 31, awayScore: 28 },
      { season: 2, week: 2, status: 'scheduled', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: null, awayScore: null },
      { season: 2, week: 3, status: 'final', homeTeam: 'Alpha', awayTeam: 'Alpha', homeScore: 99, awayScore: 0 },
      { season: 2, week: 4, status: 'final', homeTeam: 'Beta', awayTeam: 'Gamma', homeScore: NaN, awayScore: 3 }
    ],
    championshipHistory: [{ season: 1, champion: 'Alpha' }, { season: 2, champion: 'Alpha' }, { season: 2, champion: 'Beta' }],
    conferenceChampionsHistory: [{ season: 1, conference: 'SEC', champion: 'Beta' }],
    ...overrides
  };
}

test('record book includes only valid finalized games and excludes scheduled, malformed, and self-matchups', () => {
  const result = buildDynastyRecordBook(sample());
  assert.equal(result.gamesReviewed, 3);
  assert.equal(validFinalGames(sample()).length, 3);
  assert.equal(result.careerLeaders.find(row => row.team === 'Alpha').games, 3);
});

test('career and season records calculate wins, losses, points, and percentages', () => {
  const result = buildDynastyRecordBook(sample());
  const alpha = result.careerLeaders.find(row => row.team === 'Alpha');
  assert.deepEqual([alpha.wins, alpha.losses, alpha.ties, alpha.pointsFor, alpha.pointsAgainst], [2, 1, 0, 91, 52]);
  assert.equal(alpha.winPercentage, 2 / 3);
  assert.equal(result.seasonRecords[0].season, 1);
  assert.equal(result.seasonRecords[0].team, 'Alpha');
});

test('single-game scoring, largest margin, and highest combined scoring are ranked correctly', () => {
  const result = buildDynastyRecordBook(sample());
  assert.equal(result.singleGameScoring[0].team, 'Alpha');
  assert.equal(result.singleGameScoring[0].points, 42);
  assert.equal(result.largestWins[0].margin, 35);
  assert.equal(result.highestScoringGames[0].totalPoints, 59);
});

test('championship leaders count only explicitly recorded title rows', () => {
  const result = buildDynastyRecordBook(sample());
  assert.deepEqual(result.championshipLeaders[0], { team: 'Alpha', nationalTitles: 2, conferenceTitles: 0 });
  assert.equal(result.championshipLeaders.find(row => row.team === 'Beta').conferenceTitles, 1);
});

test('empty and malformed input produces an explicit empty record book', () => {
  const result = buildDynastyRecordBook({ scheduleGames: [{ status: 'final', homeTeam: 'A', awayTeam: 'B', homeScore: '10', awayScore: 3 }] });
  assert.equal(result.gamesReviewed, 0);
  assert.equal(result.careerLeaders.length, 0);
  assert.match(result.note, /missing history is not inferred/i);
});

test('team normalization is whitespace and case insensitive for record aggregation', () => {
  const result = buildDynastyRecordBook({ scheduleGames: [
    { season: 1, status: 'final', homeTeam: ' Alpha  Team ', awayTeam: 'Beta', homeScore: 10, awayScore: 0 },
    { season: 1, status: 'final', homeTeam: 'alpha team', awayTeam: 'Gamma', homeScore: 7, awayScore: 3 }
  ] });
  const alpha = result.careerLeaders.find(row => row.team.toLowerCase().includes('alpha'));
  assert.equal(alpha.wins, 2);
});
