'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rankBeforeGame, capturePreGameRanks, buildUpsetTracker } = require('../utils/upsetTracker');

function sample() {
  return { season: 1, teamSelections: [{ team: 'Alabama' }, { team: 'Auburn' }, { team: 'Georgia' }], scheduleGames: [
    { id: 'g1', season: 1, week: 1, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 28, awayScore: 7, status: 'final' },
    { id: 'g2', season: 1, week: 1, homeTeam: 'Auburn', awayTeam: 'Georgia', homeScore: 10, awayScore: 17, status: 'final' },
    { id: 'g3', season: 1, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 24, awayScore: 21, status: 'final' }
  ] };
}

test('pregame ranks use only finalized results from earlier weeks', () => {
  const dynasty = sample();
  const ranks = rankBeforeGame(dynasty, dynasty.scheduleGames[2]);
  assert.equal(ranks.alabama.rank, 1);
  assert.ok(ranks.auburn.rank > ranks.alabama.rank);
});

test('tracker identifies a lower-ranked team defeating a higher-ranked team', () => {
  const rows = buildUpsetTracker(sample());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].winner, 'Auburn');
  assert.equal(rows[0].loser, 'Alabama');
  assert.equal(rows[0].rankingSource, 'reconstructed-earlier-weeks');
});

test('pregame ranking snapshots persist and are not overwritten', () => {
  const dynasty = sample();
  const game = { season: 1, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', status: 'scheduled' };
  const first = capturePreGameRanks(dynasty, game);
  assert.equal(first.homeRank, 3);
  game.preGameRanks.homeRank = 9;
  assert.equal(capturePreGameRanks(dynasty, game).homeRank, 9);
});

test('tracker ignores ties, unplayed games, invalid scores, and games without rank separation', () => {
  const rows = buildUpsetTracker({ season: 1, teamSelections: [{ team: 'A' }, { team: 'B' }], scheduleGames: [
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 7, awayScore: 7, status: 'final' },
    { season: 1, week: 2, homeTeam: 'A', awayTeam: 'B', homeScore: 10, awayScore: 0, status: 'scheduled' },
    { season: 1, week: 3, homeTeam: 'A', awayTeam: 'B', homeScore: '10', awayScore: 0, status: 'final' }
  ] });
  assert.deepEqual(rows, []);
});
