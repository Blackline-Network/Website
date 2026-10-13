'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRecruitingClassArchive } = require('../utils/recruitingRankings');

test('archives historical recruiting classes by season and signed star points', () => {
  const result = buildRecruitingClassArchive({ recruitingProspects: [
    { name: 'QB A', team: 'Alabama', season: 1, status: 'Signed', stars: 5, position: 'QB' },
    { name: 'WR B', team: 'Alabama', season: 1, status: 'Signed', stars: 4, position: 'WR' },
    { name: 'RB C', team: 'Auburn', season: 1, status: 'Committed', stars: 5, position: 'RB' },
    { name: 'CB D', team: 'Alabama', season: 2, status: 'Signed', stars: 3, position: 'CB' }
  ] });
  assert.deepEqual(result.seasons.map(s => s.season), [2, 1]);
  assert.deepEqual(result.seasons[1].teams.map(t => [t.team, t.signed, t.starPoints]), [['Alabama', 2, 9], ['Auburn', 0, 0]]);
  assert.equal(result.seasons[1].teams[0].averageStars, 4.5);
});

test('archive normalizes team names and excludes invalid stars from score', () => {
  const result = buildRecruitingClassArchive({ recruitingProspects: [
    { name: 'A', team: ' Alabama ', season: 3, status: 'Signed', stars: 4 },
    { name: 'B', team: 'alabama', season: 3, status: 'signed', stars: 9 },
    { name: 'C', team: 'Alabama', season: 3, status: 'Offered', stars: 5 }
  ] });
  assert.equal(result.seasons[0].teams.length, 1);
  assert.equal(result.seasons[0].teams[0].signed, 2);
  assert.equal(result.seasons[0].teams[0].starPoints, 4);
  assert.equal(result.seasons[0].teams[0].averageStars, 4);
});

test('archive handles empty data and limits returned seasons', () => {
  assert.deepEqual(buildRecruitingClassArchive({ recruitingProspects: [] }).seasons, []);
  const records = [1, 2, 3].map(season => ({ name: `P${season}`, team: 'A', season, status: 'Signed', stars: 3 }));
  const result = buildRecruitingClassArchive({ recruitingProspects: records }, { limit: 2 });
  assert.equal(result.totalSeasons, 3);
  assert.deepEqual(result.seasons.map(s => s.season), [3, 2]);
});
