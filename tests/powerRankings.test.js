'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePowerRankings } = require('../utils/powerRankings');

test('power rankings prioritize results and include selected teams without games', () => {
  const rows = calculatePowerRankings({ season: 1, teamSelections: [{ team: 'Alabama' }, { team: 'Auburn' }, { team: 'Georgia' }], scheduleGames: [
    { season: 1, week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 31, awayScore: 10, status: 'final' },
    { season: 1, week: 2, homeTeam: 'Georgia', awayTeam: 'Alabama', homeScore: 14, awayScore: 24, status: 'final' },
    { season: 1, week: 3, homeTeam: 'Auburn', awayTeam: 'Georgia', homeScore: 17, awayScore: 20, status: 'final' }
  ] });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].team, 'Alabama');
  assert.equal(rows[0].wins, 2);
  assert.equal(rows[0].losses, 0);
  assert.equal(rows[0].recentForm, 'W-W');
});

test('power rankings exclude other seasons, scheduled games, invalid scores and self matchups', () => {
  const rows = calculatePowerRankings({ season: 2, teamSelections: [{ team: 'A' }, { team: 'B' }], scheduleGames: [
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 10, awayScore: 0, status: 'final' },
    { season: 2, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 10, awayScore: 0, status: 'scheduled' },
    { season: 2, week: 2, homeTeam: 'A', awayTeam: 'B', homeScore: '10', awayScore: 0, status: 'final' },
    { season: 2, week: 3, homeTeam: 'A', awayTeam: 'A', homeScore: 10, awayScore: 0, status: 'final' }
  ] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].games, 0);
  assert.equal(rows[1].games, 0);
  assert.equal(rows[0].powerScore, 0);
  assert.equal(rows[1].powerScore, 0);
});

test('power rankings treat ties as half a win and never overwrite manual rankings', () => {
  const dynasty = { season: 1, rankings: ['Manual #1'], teamSelections: [{ team: 'A' }, { team: 'B' }], scheduleGames: [
    { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 7, awayScore: 7, status: 'final' }
  ] };
  const before = [...dynasty.rankings];
  const rows = calculatePowerRankings(dynasty);
  assert.equal(rows[0].ties, 1);
  assert.equal(rows[0].winPercentage, 0.5);
  assert.deepEqual(dynasty.rankings, before);
});
