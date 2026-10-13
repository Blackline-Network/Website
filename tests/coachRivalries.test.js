'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachRivalries } = require('../utils/coachRivalries');

function sample() {
  return {
    season: 2,
    teamSelections: [
      { userId: 'coach-a', team: 'Alabama', username: 'Coach A' },
      { userId: 'coach-b', team: 'Auburn', username: 'Coach B' }
    ],
    coachCareers: {
      'coach-a': [{ team: 'Alabama', startSeason: 1, endSeason: 1 }],
      'coach-b': [{ team: 'Auburn', startSeason: 1, endSeason: 1 }]
    },
    scheduleGames: [
      { season: 1, week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 24, awayScore: 14, status: 'final' },
      { season: 1, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 17, awayScore: 21, status: 'final' },
      { season: 2, week: 1, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 10, awayScore: 7, status: 'final' },
      { season: 2, week: 2, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 0, awayScore: 0, status: 'scheduled' }
    ]
  };
}

test('aggregates coach head-to-head from recorded tenures and current-season assignments', () => {
  const rows = buildCoachRivalries(sample());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 3);
  assert.equal(rows[0].coachAWins + rows[0].coachBWins, 3);
  assert.equal(rows[0].latest.season, 2);
  assert.equal(rows[0].streak.count, 1);
});

test('skips coach rivalry games with ambiguous overlapping tenure attribution', () => {
  const dynasty = sample();
  dynasty.coachCareers['coach-a'].push({ team: 'Auburn', startSeason: 1, endSeason: 1 });
  const rows = buildCoachRivalries(dynasty);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].games, 1); // only the unambiguous current-season assignment is retained
});

test('ignores unplayed, malformed, self-match, and unknown historical assignments', () => {
  const dynasty = { season: 3, teamSelections: [], coachCareers: {}, scheduleGames: [
    { season: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 7, awayScore: 0, status: 'final' },
    { season: 3, homeTeam: 'A', awayTeam: 'B', homeScore: '7', awayScore: 0, status: 'final' },
    { season: 3, homeTeam: 'A', awayTeam: 'A', homeScore: 7, awayScore: 0, status: 'final' }
  ] };
  assert.deepEqual(buildCoachRivalries(dynasty), []);
});
