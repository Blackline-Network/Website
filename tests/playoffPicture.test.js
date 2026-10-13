'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayoffPicture } = require('../utils/playoffPicture');

function teams(count) { return Array.from({ length: count }, (_, i) => `Team ${String(i + 1).padStart(2, '0')}`); }

test('playoff picture estimates a 12-team field, bye seeds, at-large teams and bubble candidates', () => {
  const names = teams(16);
  const dynasty = {
    season: 2,
    teamSelections: names.map(team => ({ team })),
    rankings: names,
    teamConferences: Object.fromEntries(names.map((team, index) => [team.toLowerCase(), `Conference ${Math.floor(index / 4) + 1}`])),
    scheduleGames: [
      { season: 2, week: 1, homeTeam: names[0], awayTeam: names[1], homeScore: 28, awayScore: 10, status: 'final' },
      { season: 2, week: 2, homeTeam: names[2], awayTeam: names[3], homeScore: 21, awayScore: 24, status: 'final' },
      { season: 2, week: 3, homeTeam: names[0], awayTeam: names[4], status: 'scheduled' }
    ]
  };
  const result = buildPlayoffPicture(dynasty);
  assert.equal(result.projected.length, 12);
  assert.equal(result.projected.filter(row => row.bye).length, 4);
  assert.equal(result.projected.filter(row => row.bidType === 'Conference champion').length, 4);
  assert.equal(result.bubble.length, 4);
  assert.equal(result.bubble[0].team, 'Team 12');
  assert.equal(result.projected[0].team, 'Team 01');
  assert.equal(result.remainingGames, 1);
  assert.equal(result.gamesConsidered, 2);
  assert.match(result.notes, /Projection only/);
});

test('playoff picture does not count another season, malformed scores, or self-matchups', () => {
  const names = teams(12);
  const result = buildPlayoffPicture({
    season: 3,
    teamSelections: names.map(team => ({ team })),
    rankings: names,
    teamConferences: Object.fromEntries(names.map((team, index) => [team, `Conference ${index % 3}`])),
    scheduleGames: [
      { season: 2, week: 1, homeTeam: names[0], awayTeam: names[1], homeScore: 100, awayScore: 0, status: 'final' },
      { season: 3, week: 1, homeTeam: names[0], awayTeam: names[1], homeScore: '21', awayScore: 0, status: 'final' },
      { season: 3, week: 2, homeTeam: names[0], awayTeam: names[0], homeScore: 99, awayScore: 0, status: 'final' },
      { season: 3, week: 3, homeTeam: names[0], awayTeam: names[2], homeScore: 10, awayScore: 7, status: 'final' }
    ]
  });
  assert.equal(result.gamesConsidered, 1);
  assert.equal(result.projected[0].standing.record, '1-0');
});

test('playoff picture safely handles too few teams and missing conference assignments', () => {
  const result = buildPlayoffPicture({ season: 1, teamSelections: [{ team: 'Alpha' }, { team: 'Beta' }], scheduleGames: [] });
  assert.equal(result.projected.length, 2);
  assert.match(result.notes, /Only 2 distinct teams/);
  assert.equal(result.conferenceAssignments, 0);
});

test('playoff picture reads the latest same-season published ranking snapshot first', () => {
  const names = teams(12);
  const result = buildPlayoffPicture({
    season: 4,
    teamSelections: names.map(team => ({ team })),
    rankings: [...names].reverse(),
    seasonRankings: [
      { season: 3, updatedAt: '2026-01-01', teams: [...names].reverse() },
      { season: 4, updatedAt: '2026-03-01', teams: [...names].reverse() },
      { season: 4, updatedAt: '2026-04-01', teams: names }
    ],
    teamConferences: Object.fromEntries(names.map((team, index) => [team, `Conference ${index % 4}`]))
  });
  assert.equal(result.projected[0].team, 'Team 01');
});
