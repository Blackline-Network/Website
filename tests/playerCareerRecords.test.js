'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayerCareerRecords } = require('../utils/playerCareerRecords');

test('player career records combine honors and draft history case-insensitively', () => {
  const result = buildPlayerCareerRecords({
    heismanHistory: [{ season: 2, winner: 'Alex Smith', team: 'A' }],
    awardHistory: [{ season: 3, winner: 'alex smith', award: 'Best QB', team: 'B' }],
    draftHistory: [{ season: 4, player: 'ALEX SMITH', detail: 'Round 1' }, { season: 2, player: 'Jordan Lee' }]
  });
  assert.equal(result.validRecords, 4);
  assert.equal(result.players[0].name, 'Alex Smith');
  assert.equal(result.players[0].heismanCount, 1);
  assert.equal(result.players[0].awardCount, 2);
  assert.equal(result.players[0].draftCount, 1);
  assert.deepEqual(result.players[0].seasons, [2, 3, 4]);
  assert.deepEqual(result.players[0].teams, ['A', 'B']);
});

test('player career records skip malformed history and do not infer stats', () => {
  const result = buildPlayerCareerRecords({ heismanHistory: [{ season: 'bad', winner: 'A' }], awardHistory: [{ season: 1, winner: 'B' }], draftHistory: [{ season: 0, player: 'C' }] });
  assert.equal(result.validRecords, 0);
  assert.deepEqual(result.players, []);
  assert.match(result.note, /never inferred/);
});
