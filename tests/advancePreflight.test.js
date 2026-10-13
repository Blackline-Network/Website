'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAdvancePreflight } = require('../utils/advancePreflight');
const { recordAdvanceBlocked, getAdvanceAuditEntries } = require('../utils/advanceAudit');

function dynasty(overrides = {}) {
  return {
    season: 3,
    currentPhase: 'week2',
    scheduleGames: [
      { id: 'g1', season: 3, week: 2, homeTeam: 'Alabama', awayTeam: 'Auburn', status: 'final', homeScore: 24, awayScore: 17 },
      { id: 'g2', season: 3, week: 2, homeTeam: 'Georgia', awayTeam: 'Florida', status: 'final', homeScore: 31, awayScore: 14 }
    ],
    ...overrides
  };
}

test('advance preflight allows a valid current week with all scores finalized', () => {
  const result = checkAdvancePreflight(dynasty());
  assert.equal(result.allowed, true);
  assert.equal(result.activeWeek, 2);
  assert.equal(result.unresolvedGames, 0);
});

test('advance preflight blocks when current-week games remain unfinished', () => {
  const item = dynasty();
  item.scheduleGames[0].status = 'scheduled';
  delete item.scheduleGames[0].homeScore;
  delete item.scheduleGames[0].awayScore;
  const result = checkAdvancePreflight(item);
  assert.equal(result.allowed, false);
  assert.equal(result.unresolvedGames, 1);
  assert.match(result.blockers.join(' '), /Week 2 still has 1 game/);
});

test('advance preflight blocks structural schedule errors even if active-week games are final', () => {
  const item = dynasty();
  item.scheduleGames.push({ id: 'g1', season: 3, week: 3, homeTeam: 'Alabama', awayTeam: 'Georgia', status: 'scheduled' });
  const result = checkAdvancePreflight(item);
  assert.equal(result.allowed, false);
  assert.match(result.blockers.join(' '), /duplicates a game ID/);
});

test('advance preflight does not block non-week phases solely because future games are unfinished', () => {
  const item = dynasty({ currentPhase: 'preseason' });
  item.scheduleGames[0].status = 'scheduled';
  const result = checkAdvancePreflight(item);
  assert.equal(result.allowed, true);
});

test('blocked advance attempts are visible in advance audit history', () => {
  const item = {};
  recordAdvanceBlocked(item, { source: 'manual', actorId: '42', actorTag: 'Commissioner', blockers: ['Unfinished Week 2 game'] });
  const entries = getAdvanceAuditEntries(item, 1);
  assert.equal(entries[0].action, 'week-advance-blocked');
  assert.equal(entries[0].details.blockers, 'Unfinished Week 2 game');
});
