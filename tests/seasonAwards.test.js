'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewSeasonAwards } = require('../utils/seasonAwards');

test('review returns only records for requested season', () => {
  const result = reviewSeasonAwards({ season: 2, heismanHistory: [{ season: 1, winner: 'Old Winner' }, { season: 2, winner: 'Current Winner' }] }, 2);
  assert.equal(result.counts.records, 1);
  assert.equal(result.entries[0].name, 'Current Winner');
});
test('checklist reflects recorded categories without inventing awards', () => {
  const result = reviewSeasonAwards({ season: 3, championshipHistory: [{ season: 3, champion: 'Alabama' }] }, 3);
  assert.equal(result.checklist.find(x => x.label === 'National champion').recorded, true);
  assert.equal(result.checklist.find(x => x.label === 'Heisman winner').recorded, false);
  assert.equal(result.counts.records, 1);
});
test('duplicate awards are flagged but records are not modified', () => {
  const data = { awardHistory: [{ season: 4, winner: 'Player A', team: 'Team X', award: 'Best QB' }, { season: 4, winner: ' player a ', team: 'team x', award: 'Best QB' }] };
  const before = JSON.stringify(data);
  const result = reviewSeasonAwards(data, 4);
  assert.equal(result.counts.warnings, 1);
  assert.equal(JSON.stringify(data), before);
});
test('different award types for the same recipient are not duplicates', () => {
  const result = reviewSeasonAwards({ awardHistory: [{ season: 4, winner: 'Player A', team: 'Team X', award: 'Best QB' }, { season: 4, winner: 'Player A', team: 'Team X', award: 'Best Player' }] }, 4);
  assert.equal(result.counts.warnings, 0);
});
test('missing recipients are surfaced as errors', () => {
  const result = reviewSeasonAwards({ heismanHistory: [{ season: 5, winner: '' }] }, 5);
  assert.equal(result.counts.errors, 1);
});
