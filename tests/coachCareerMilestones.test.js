'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachCareerMilestones, recordedCoachGames } = require('../utils/coachCareerMilestones');

function dynasty() {
  return {
    season: 2,
    teamSelections: [{ userId: 'coach-a', team: 'Alabama' }],
    coachCareers: { 'coach-a': [{ team: 'Alabama', startSeason: 1, endSeason: 2 }] },
    scheduleGames: [
      { season: 1, week: 1, homeTeam: 'Alabama', awayTeam: 'A', homeScore: 21, awayScore: 7, status: 'final' },
      { season: 1, week: 2, homeTeam: 'B', awayTeam: 'Alabama', homeScore: 10, awayScore: 14, status: 'final' },
      { season: 1, week: 3, homeTeam: 'Alabama', awayTeam: 'C', homeScore: 24, awayScore: 3, status: 'final' },
      { season: 1, week: 4, homeTeam: 'D', awayTeam: 'Alabama', homeScore: 17, awayScore: 20, status: 'final' },
      { season: 1, week: 5, homeTeam: 'Alabama', awayTeam: 'E', homeScore: 28, awayScore: 0, status: 'final' },
      { season: 2, week: 1, homeTeam: 'Alabama', awayTeam: 'F', homeScore: 31, awayScore: 7, status: 'final' },
      { season: 2, week: 2, homeTeam: 'Alabama', awayTeam: 'G', homeScore: 10, awayScore: 10, status: 'final' },
      { season: 2, week: 3, homeTeam: 'Alabama', awayTeam: 'H', homeScore: 99, awayScore: 0, status: 'scheduled' },
      { season: 2, week: 4, homeTeam: 'Alabama', awayTeam: 'Alabama', homeScore: 10, awayScore: 0, status: 'final' }
    ]
  };
}

test('tracks career win streak across seasons and resets current streak on a tie', () => {
  const d = dynasty();
  const result = buildCoachCareerMilestones(d, 'coach-a', { seasons: [] });
  assert.equal(result.longestWinStreak, 6);
  assert.equal(result.currentWinStreak, 0);
  assert.equal(result.gamesCounted, 7);
  assert.ok(result.milestones.includes('🔥 6-game career win streak'));
  assert.equal(result.milestones.some(line => line.includes('Active')), false);
});

test('adds sustained-season milestones only from supplied recorded season stats', () => {
  const result = buildCoachCareerMilestones(dynasty(), 'coach-a', { seasons: [
    { season: 1, wins: 10, losses: 0, ties: 0, games: 10 },
    { season: 2, wins: 6, losses: 3, ties: 1, games: 10 },
    { season: 3, wins: 8, losses: 0, ties: 0, games: 8 }
  ] });
  assert.equal(result.winningSeasons, 3);
  assert.equal(result.tenWinSeasons, 1);
  assert.equal(result.undefeatedSeasons, 2);
  assert.ok(result.milestones.includes('🏅 Sustained success: 5+ winning seasons') === false);
  assert.ok(result.milestones.includes('🏆 1 season(s) with 10+ wins'));
  assert.ok(result.milestones.includes('💎 2 unbeaten season(s) with at least 8 games'));
});

test('does not infer old history without tenure, and excludes scheduled, self-match, and ambiguous games', () => {
  const d = dynasty();
  d.coachCareers = {};
  const fallback = recordedCoachGames(d, 'coach-a');
  assert.equal(fallback.length, 2);
  assert.equal(fallback[0].season, 2);
  d.coachCareers['coach-a'] = [
    { team: 'Alabama', startSeason: 1, endSeason: 2 },
    { team: 'A', startSeason: 1, endSeason: 1 }
  ];
  const explicit = recordedCoachGames(d, 'coach-a');
  assert.equal(explicit.some(game => game.season === 1 && game.week === 1), false);
  assert.equal(explicit.some(game => game.season === 2 && game.week === 3), false);
  assert.equal(explicit.some(game => game.season === 2 && game.week === 4), false);
});

test('does not award an undefeated-season milestone below the minimum game threshold', () => {
  const result = buildCoachCareerMilestones(dynasty(), 'coach-a', { seasons: [
    { season: 1, wins: 4, losses: 0, ties: 0, games: 4 }
  ] });
  assert.equal(result.undefeatedSeasons, 0);
  assert.equal(result.milestones.some(line => line.includes('unbeaten season')), false);
});
