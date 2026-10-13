'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { finalizedPlayoffGames, bracketReplacementError, validatePlayoffScore } = require('../utils/playoffSafety');

test('an unplayed current-season bracket can be replaced', () => {
  assert.equal(bracketReplacementError({ season: 4, rounds: [{ games: [{ status: 'pending' }] }] }, 4), null);
});
test('a bracket with final results is protected from replacement', () => {
  const bracket = { season: 4, rounds: [{ games: [{ status: 'final', winner: 'Alabama', homeScore: 31, awayScore: 17 }, { status: 'pending' }] }] };
  assert.equal(finalizedPlayoffGames(bracket).length, 1);
  assert.match(bracketReplacementError(bracket, 4), /will not replace or reseed it/);
});
test('an old-season bracket does not block current-season setup', () => {
  assert.equal(bracketReplacementError({ season: 3, rounds: [{ games: [{ status: 'final', winner: 'A' }] }] }, 4), null);
});
test('playoff score validation blocks negative, excessive, tied and non-integer scores', () => {
  assert.match(validatePlayoffScore(-1, 3), /negative/);
  assert.match(validatePlayoffScore(301, 3), /300 or lower/);
  assert.match(validatePlayoffScore(14, 14), /cannot end in a tie/);
  assert.match(validatePlayoffScore(14.5, 7), /whole numbers/);
  assert.equal(validatePlayoffScore(31, 17), null);
});
