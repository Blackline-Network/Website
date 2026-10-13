'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditSeasonSchedule, validateScheduledGame, seasonCloseError } = require('../utils/seasonIntegrity');

const base = { season: 2, scheduleGames: [
  { id: 'a', season: 2, week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', status: 'final', homeScore: 24, awayScore: 17 },
  { id: 'b', season: 2, week: 1, homeTeam: 'Georgia', awayTeam: 'Florida', status: 'final', homeScore: 31, awayScore: 14 }
], championshipHistory: [{ season: 2, champion: 'Alabama', runnerUp: 'Georgia' }] };

test('valid season schedule audits cleanly', () => {
  const result = auditSeasonSchedule(base);
  assert.equal(result.errors, 0);
  assert.equal(result.warnings, 0);
  assert.equal(result.games, 2);
});

test('audit detects duplicate matchup and team double-booking', () => {
  const dynasty = structuredClone(base);
  dynasty.scheduleGames.push({ id: 'c', season: 2, week: 1, homeTeam: 'Auburn', awayTeam: 'Alabama', status: 'scheduled' });
  const result = auditSeasonSchedule(dynasty);
  assert.ok(result.findings.some(f => f.code === 'duplicate-matchup'));
  assert.ok(result.findings.some(f => f.code === 'team-double-booked'));
});

test('audit detects invalid final score and invalid week', () => {
  const dynasty = structuredClone(base);
  dynasty.scheduleGames[0].homeScore = 301;
  dynasty.scheduleGames[1].week = 18;
  const result = auditSeasonSchedule(dynasty);
  assert.ok(result.findings.some(f => f.code === 'invalid-final-score'));
  assert.ok(result.findings.some(f => f.code === 'invalid-week'));
});

test('new scheduled games cannot double-book a team or duplicate a matchup', () => {
  assert.match(validateScheduledGame(base, { week: 1, homeTeam: 'Alabama', awayTeam: 'Florida' }), /already has a game/);
  assert.match(validateScheduledGame(base, { week: 1, homeTeam: 'Auburn', awayTeam: 'Alabama' }), /already exists/);
  assert.equal(validateScheduledGame(base, { week: 2, homeTeam: 'Alabama', awayTeam: 'Florida' }), null);
});

test('season close requires complete valid schedule and exactly one champion', () => {
  assert.equal(seasonCloseError(base), null);
  const unresolved = structuredClone(base);
  unresolved.scheduleGames[0].status = 'scheduled';
  assert.match(seasonCloseError(unresolved), /do not have valid final scores/);
  const duplicateChampion = structuredClone(base);
  duplicateChampion.championshipHistory.push({ season: 2, champion: 'Georgia' });
  assert.match(seasonCloseError(duplicateChampion), /Multiple champion records/);
});

test('season close rejects empty season records', () => {
  assert.match(seasonCloseError({ season: 1, scheduleGames: [], championshipHistory: [{ season: 1, champion: 'Alabama' }] }), /no recorded games/);
});
