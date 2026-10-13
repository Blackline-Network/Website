'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeeklyRecap } = require('../utils/weeklyRecap');

function sample() {
  return {
    season: 2,
    teamSelections: [{ team: 'Alabama' }, { team: 'Auburn' }, { team: 'Georgia' }],
    scheduleGames: [
      { id: 'a', season: 2, week: 1, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 28, awayScore: 7, status: 'final' },
      { id: 'b', season: 2, week: 1, homeTeam: 'Auburn', awayTeam: 'Georgia', homeScore: 14, awayScore: 10, status: 'final' },
      { id: 'c', season: 2, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 24, awayScore: 21, status: 'final' },
      { id: 'd', season: 2, week: 3, homeTeam: 'Georgia', awayTeam: 'Alabama', homeScore: 10, awayScore: 17, status: 'scheduled' }
    ],
    recruitingProspects: [{ name: 'Casey QB', position: 'QB', stars: 4, season: 2, team: 'Auburn', statusHistory: [
      { toStatus: 'Committed', season: 2, week: 2, team: 'Auburn' },
      { toStatus: 'Signed', season: 2, team: 'Auburn' }
    ] }]
  };
}

test('weekly recap defaults to latest week with finalized results', () => {
  const recap = buildWeeklyRecap(sample());
  assert.equal(recap.week, 2);
  assert.equal(recap.gamesPlayed, 1);
  assert.equal(recap.results[0].winner, 'Auburn');
});

test('weekly recap includes only explicit recruiting milestones tagged to the selected week', () => {
  const recap = buildWeeklyRecap(sample(), { week: 2 });
  assert.equal(recap.recruitingMilestones.length, 1);
  assert.equal(recap.recruitingMilestones[0].status, 'committed');
  assert.equal(recap.recruitingMilestones[0].name, 'Casey QB');
});

test('weekly recap filters results, upsets and rivalry outcomes to the selected season and week', () => {
  const dynasty = sample();
  dynasty.scheduleGames.push({ season: 1, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 3, awayScore: 2, status: 'final' });
  const recap = buildWeeklyRecap(dynasty, { week: 2 });
  assert.equal(recap.results.length, 1);
  assert.ok(recap.rivalries.every(item => item.teamA && item.teamB));
  assert.ok(recap.upsets.every(item => item.week === 2));
});

test('weekly recap excludes scheduled games and reports empty weeks safely', () => {
  const recap = buildWeeklyRecap(sample(), { week: 3 });
  assert.equal(recap.gamesPlayed, 0);
  assert.deepEqual(recap.results, []);
});

test('weekly recap provides ranking movement only when prior-week rankings exist', () => {
  const recap = buildWeeklyRecap(sample(), { week: 2 });
  assert.equal(recap.hasPriorRanking, true);
  assert.ok(Array.isArray(recap.rankingMovement));
  const weekOne = buildWeeklyRecap(sample(), { week: 1 });
  assert.equal(weekOne.hasPriorRanking, false);
});
