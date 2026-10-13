const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRecruitingRankings } = require('../utils/recruitingRankings');

test('ranks current-season signed classes by total recorded star points', () => {
  const d = { season: 2, recruitingProspects: [
    { name: 'QB A', team: 'Alabama', season: 2, status: 'Signed', stars: 4 },
    { name: 'WR B', team: 'Alabama', season: 2, status: 'Signed', stars: 5 },
    { name: 'RB C', team: 'Auburn', season: 2, status: 'Signed', stars: 4 },
    { name: 'CB D', team: 'Auburn', season: 2, status: 'Committed', stars: 5 },
    { name: 'OL E', team: 'Georgia', season: 1, status: 'Signed', stars: 5 }
  ] };
  const rows = calculateRecruitingRankings(d);
  assert.deepEqual(rows.map(r => [r.team, r.signed, r.starPoints]), [['Alabama', 2, 9], ['Auburn', 1, 4]]);
});

test('returns an empty list when there are no valid signed prospects', () => {
  assert.deepEqual(calculateRecruitingRankings({ season: 1, recruitingProspects: [
    { name: 'Prospect', team: 'A', season: 1, status: 'Interested', stars: 5 },
    { name: 'Bad', team: 'B', season: 1, status: 'Signed', stars: 9 }
  ] }), []);
});

test('normalizes team names for grouping and uses deterministic tie-breakers', () => {
  const rows = calculateRecruitingRankings({ season: 1, recruitingProspects: [
    { name: 'A', team: ' Alabama ', season: 1, status: 'signed', stars: 3 },
    { name: 'B', team: 'alabama', season: 1, status: 'Signed', stars: 2 },
    { name: 'C', team: 'Auburn', season: 1, status: 'Signed', stars: 5 }
  ] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].team, 'Alabama');
  assert.equal(rows[0].signed, 2);
  assert.equal(rows[0].starPoints, 5);
});
