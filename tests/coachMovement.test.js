'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachMovementHistory } = require('../utils/coachMovement');

test('builds chronological job history and distinct program changes from recorded tenures', () => {
  const result = buildCoachMovementHistory({ coachCareers: { c: [
    { team: 'Auburn', startSeason: 3, endSeason: 4, wins: 18, losses: 8 },
    { team: 'Alabama', startSeason: 1, endSeason: 2, wins: 20, losses: 6 },
    { team: ' Alabama ', startSeason: 1, endSeason: 2, wins: 20, losses: 6 }
  ] } }, 'c');
  assert.deepEqual(result.tenures.map(x => x.team), ['Alabama', 'Auburn']);
  assert.equal(result.totalPrograms, 2);
  assert.deepEqual(result.transitions.map(x => [x.from, x.to, x.startSeason]), [['Alabama', 'Auburn', 3]]);
});

test('flags overlapping tenures and does not claim exact hiring dates', () => {
  const result = buildCoachMovementHistory({ coachCareers: { c: [
    { team: 'Alabama', startSeason: 1, endSeason: 3 },
    { team: 'Auburn', startSeason: 3, endSeason: 4 }
  ] } }, 'c');
  assert.equal(result.overlapping.length, 1);
  assert.equal(result.transitions[0].overlap, true);
  assert.match(result.note, /do not establish exact hiring dates/);
});

test('ignores malformed tenure ranges and safely handles missing coach history', () => {
  assert.equal(buildCoachMovementHistory({ coachCareers: { c: [{ team: 'A', startSeason: 0, endSeason: 1 }] } }, 'c').tenures.length, 0);
  assert.deepEqual(buildCoachMovementHistory({}, 'missing').transitions, []);
});
