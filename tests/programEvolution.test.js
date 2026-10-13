'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProgramEvolution, buildProgramEvolutionIndex } = require('../utils/programEvolution');

test('builds per-season records and cumulative record from finalized games only', () => {
 const dynasty = { scheduleGames: [
  { season: 1, status: 'final', homeTeam: 'Alpha', awayTeam: 'Beta', homeScore: 28, awayScore: 14 },
  { season: 2, status: 'final', homeTeam: 'Beta', awayTeam: 'Alpha', homeScore: 10, awayScore: 17 },
  { season: 2, status: 'scheduled', homeTeam: 'Alpha', awayTeam: 'Gamma', homeScore: 99, awayScore: 0 }
 ] };
 const result = buildProgramEvolution(dynasty, 'Alpha');
 assert.equal(result.gamesReviewed, 2);
 assert.deepEqual(result.overall, { wins: 2, losses: 0, ties: 0 });
 assert.equal(result.bestSeason.season, 1);
 assert.equal(result.seasonsReviewed, 2);
});
test('uses explicit honors only and ignores malformed season milestones', () => {
 const dynasty = { scheduleGames: [], championshipHistory: [{ season: 3, champion: 'Alpha', runnerUp: 'Beta' }, { season: 'unknown', champion: 'Alpha' }], conferenceChampionsHistory: [{ season: 2, winner: 'Alpha', conference: 'West' }], awardHistory: [{ season: 4, team: 'Alpha', award: 'MVP' }] };
 const result = buildProgramEvolution(dynasty, 'alpha');
 assert.equal(result.nationalTitles, 2);
 assert.equal(result.conferenceTitles, 1);
 assert.equal(result.awards, 1);
 assert.equal(result.timeline.some(x => x.season === 3 && x.type === 'National Champion'), true);
 assert.equal(result.timeline.some(x => x.season === 0), false);
});
test('index covers program names derived from recorded data', () => {
 const rows = buildProgramEvolutionIndex({ teamSelections: [{ team: 'Alpha' }, { team: 'Beta' }], scheduleGames: [] });
 assert.deepEqual(rows.map(x => x.team), ['Alpha', 'Beta']);
});
