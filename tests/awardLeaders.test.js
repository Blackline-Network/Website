'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAwardLeaders } = require('../utils/awardLeaders');

test('award leaders aggregate recipient honors case-insensitively and rank categories', () => {
  const result = buildAwardLeaders({
    heismanHistory: [{ season: 1, winner: 'Alex Smith', team: 'A' }, { season: 2, winner: 'Alex Smith', team: 'B' }],
    awardHistory: [{ season: 2, winner: 'alex smith', award: 'Best QB' }, { season: 2, winner: 'Jordan Lee', award: 'Best QB' }]
  });
  assert.equal(result.validRecords, 4);
  assert.equal(result.recipientLeaders[0].count, 3);
  assert.equal(result.recipientLeaders[0].seasons.length, 2);
  assert.equal(result.awardLeaders.find(row => row.name === 'Best QB').count, 2);
});

test('award leaders ignore malformed records and never infer awards', () => {
  const result = buildAwardLeaders({ heismanHistory: [{ season: 1, winner: '' }, { season: 'x', winner: 'Someone' }], awardHistory: [] });
  assert.equal(result.validRecords, 0);
  assert.deepEqual(result.recipientLeaders, []);
  assert.match(result.note, /No missing awards are inferred/);
});
