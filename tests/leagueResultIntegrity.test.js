'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLeagueResult, getPreviousResult } = require('../utils/leagueResultIntegrity');

test('accepts valid league result including a regular-season tie', () => {
  assert.equal(validateLeagueResult({ week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 17, awayScore: 17 }), null);
});
test('rejects invalid weeks, empty teams, and same team matchup', () => {
  const base = { week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 1, awayScore: 0 };
  assert.match(validateLeagueResult({ ...base, week: 16 }), /Week must/);
  assert.match(validateLeagueResult({ ...base, homeTeam: ' ' }), /Both home and away/);
  assert.match(validateLeagueResult({ ...base, awayTeam: '  alabama ' }), /different/);
});
test('rejects non-integer, negative, and implausibly high scores', () => {
  const base = { week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 1, awayScore: 0 };
  assert.match(validateLeagueResult({ ...base, homeScore: 1.5 }), /whole number/);
  assert.match(validateLeagueResult({ ...base, awayScore: -1 }), /between 0 and 300/);
  assert.match(validateLeagueResult({ ...base, homeScore: 301 }), /between 0 and 300/);
});
test('previous result helper distinguishes unfinalized and malformed finals', () => {
  assert.equal(getPreviousResult({ status: 'scheduled' }), null);
  assert.equal(getPreviousResult({ status: 'final', homeScore: 20, awayScore: 13 }), '20-13');
  assert.equal(getPreviousResult({ status: 'final', homeScore: null, awayScore: 13 }), 'invalid-final-score');
});
