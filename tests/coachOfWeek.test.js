'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachOfWeek } = require('../utils/coachOfWeek');

function sample() {
  return {
    season: 3,
    coaches: [{ userId: 'u1', username: 'Coach Alpha' }, { userId: 'u2', username: 'Coach Beta' }],
    teamSelections: [{ userId: 'u1', team: 'Alabama' }, { userId: 'u2', team: 'Auburn' }],
    scheduleGames: [
      { id: '1', season: 3, week: 1, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 21, awayScore: 7, status: 'final' },
      { id: '2', season: 3, week: 2, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 10, awayScore: 31, status: 'final' },
      { id: '3', season: 3, week: 3, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 10, awayScore: 14, status: 'scheduled' },
      { id: '4', season: 2, week: 4, homeTeam: 'Auburn', awayTeam: 'Alabama', homeScore: 99, awayScore: 0, status: 'final' }
    ]
  };
}

test('awards the highest scoring registered coach with a finalized win in the latest week', () => {
  const result = buildCoachOfWeek(sample());
  assert.equal(result.week, 2);
  assert.equal(result.gamesPlayed, 1);
  assert.equal(result.winner.coachName, 'Coach Alpha');
  assert.equal(result.winner.team, 'Alabama');
  assert.equal(result.winner.outcome, 'win');
});

test('uses only pregame opponent rankings and does not allow same-week results to affect them', () => {
  const dynasty = sample();
  const base = buildCoachOfWeek(dynasty, { week: 2 });
  dynasty.scheduleGames.push({ id: 'same-week', season: 3, week: 2, homeTeam: 'Georgia', awayTeam: 'Auburn', homeScore: 0, awayScore: 100, status: 'final' });
  const changed = buildCoachOfWeek(dynasty, { week: 2 });
  const baseAlabama = base.candidates.find(row => row.team === 'Alabama');
  const changedAlabama = changed.candidates.find(row => row.team === 'Alabama');
  assert.equal(changedAlabama.opponentRank, baseAlabama.opponentRank);
});

test('uses ties only if no registered coach has a win that week', () => {
  const dynasty = sample();
  dynasty.scheduleGames = [{ season: 3, week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 7, awayScore: 7, status: 'final' }];
  const result = buildCoachOfWeek(dynasty);
  assert.equal(result.winner.outcome, 'tie');
  assert.equal(result.winner.score, 4);
});

test('returns no winner when no registered coach is assigned to a team with a final game', () => {
  const dynasty = sample();
  dynasty.teamSelections = [];
  const result = buildCoachOfWeek(dynasty);
  assert.equal(result.winner, null);
  assert.deepEqual(result.candidates, []);
});

test('excludes scheduled games and results from other seasons', () => {
  const dynasty = sample();
  dynasty.scheduleGames = dynasty.scheduleGames.filter(game => game.status !== 'final' || game.season !== 3);
  const result = buildCoachOfWeek(dynasty);
  assert.equal(result.gamesPlayed, 0);
  assert.equal(result.winner, null);
});
