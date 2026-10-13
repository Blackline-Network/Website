'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachCareerBySeason } = require('../utils/coachCareerStats');

function sample() {
  return {
    season: 3,
    teamSelections: [{ userId: 'coach-a', team: 'Alabama' }],
    coachCareers: { 'coach-a': [
      { team: 'Alabama', startSeason: 1, endSeason: 2 },
      { team: 'Auburn', startSeason: 2, endSeason: 2 }
    ] },
    scheduleGames: [
      { season: 1, week: 1, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 28, awayScore: 7, status: 'final' },
      { season: 2, week: 1, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 10, awayScore: 10, status: 'final' },
      { season: 2, week: 2, homeTeam: 'Alabama', awayTeam: 'Florida', homeScore: 14, awayScore: 21, status: 'final' },
      { season: 3, week: 1, homeTeam: 'Alabama', awayTeam: 'Texas', homeScore: 99, awayScore: 0, status: 'final' },
      { season: 3, week: 2, homeTeam: 'Alabama', awayTeam: 'LSU', homeScore: 7, awayScore: 3, status: 'scheduled' },
      { season: 2, week: 3, homeTeam: 'Alabama', awayTeam: 'Alabama', homeScore: 30, awayScore: 0, status: 'final' }
    ]
  };
}

test('builds season records only inside explicitly recorded coaching tenures', () => {
  const result = buildCoachCareerBySeason(sample(), 'coach-a');
  assert.deepEqual(result.seasons.map(row => row.season), [2, 1]);
  assert.deepEqual([result.seasons[0].wins, result.seasons[0].losses, result.seasons[0].ties], [0, 1, 0]);
  assert.deepEqual([result.seasons[1].wins, result.seasons[1].losses], [1, 0]);
  assert.equal(result.gamesCounted, 2);
});

test('does not attribute previous seasons to a current team without a recorded tenure', () => {
  const dynasty = sample();
  dynasty.coachCareers = {};
  const result = buildCoachCareerBySeason(dynasty, 'coach-a');
  assert.deepEqual(result.seasons.map(row => row.season), [3]);
  assert.equal(result.seasons[0].games, 1);
});

test('excludes scheduled games, malformed scores, and ambiguous overlapping team games', () => {
  const dynasty = sample();
  dynasty.coachCareers['coach-a'].push({ team: 'Georgia', startSeason: 1, endSeason: 1 });
  dynasty.scheduleGames.push({ season: 1, week: 2, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 31, awayScore: 0, status: 'final' });
  dynasty.scheduleGames.push({ season: 1, week: 3, homeTeam: 'Alabama', awayTeam: 'Florida', homeScore: '10', awayScore: 0, status: 'final' });
  const result = buildCoachCareerBySeason(dynasty, 'coach-a');
  assert.equal(result.seasons.some(row => row.season === 1), false);
});

test('identifies best season by win percentage and returns empty history when none qualifies', () => {
  const result = buildCoachCareerBySeason(sample(), 'coach-a');
  assert.equal(result.bestSeason.season, 1);
  const empty = buildCoachCareerBySeason({ season: 1, scheduleGames: [], coachCareers: {} }, 'unknown');
  assert.equal(empty.bestSeason, null);
  assert.deepEqual(empty.seasons, []);
});
