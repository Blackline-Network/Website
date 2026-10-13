'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSigningDayRecap } = require('../utils/signingDay');

test('signing day counts only explicitly signed prospects for selected season', () => {
  const result = buildSigningDayRecap({ recruitingProspects: [
    { name: 'QB One', team: 'Alabama', season: 2, stars: 5, status: 'Signed', position: 'QB' },
    { name: 'WR Two', team: 'Alabama', season: 2, stars: 4, status: 'signed', position: 'WR' },
    { name: 'RB Three', team: 'Auburn', season: 2, stars: 5, status: 'Committed', position: 'RB' },
    { name: 'DL Four', team: 'Auburn', season: 1, stars: 3, status: 'Signed', position: 'DL' }
  ] }, 2);
  assert.equal(result.signedCount, 2);
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0].team, 'Alabama');
  assert.equal(result.teams[0].starPoints, 9);
  assert.deepEqual(result.seasonTotals, [{ season: 2, signed: 2, teams: 1 }, { season: 1, signed: 1, teams: 1 }]);
});

test('signing day handles empty data and invalid ratings without inventing stars', () => {
  const result = buildSigningDayRecap({ recruitingProspects: [
    { name: 'Unknown rating', team: 'Team A', season: 1, stars: 8, status: 'Signed' }
  ] }, 1);
  assert.equal(result.signedCount, 1);
  assert.equal(result.teams[0].starPoints, 0);
  assert.equal(result.teams[0].prospects[0].stars, null);
  assert.equal(buildSigningDayRecap({}, 1).signedCount, 0);
});

test('signing day recap includes a top recruit, position breakdown, and valid star distribution', () => {
  const result = buildSigningDayRecap({ recruitingProspects: [
    { name: 'Five Star QB', team: 'Alabama', season: 3, stars: 5, status: 'Signed', position: 'QB' },
    { name: 'Four Star WR', team: 'Alabama', season: 3, stars: 4, status: 'Signed', position: 'WR' },
    { name: 'Unknown Rating', team: 'Alabama', season: 3, stars: 7, status: 'Signed', position: 'QB' }
  ] }, 3);
  const team = result.teams[0];
  assert.equal(team.topProspect.name, 'Five Star QB');
  assert.equal(team.topProspect.stars, 5);
  assert.deepEqual(team.positionCounts, { QB: 2, WR: 1 });
  assert.deepEqual(team.starDistribution, { 4: 1, 5: 1 });
});

test('signing day recap handles teams with no valid star ratings', () => {
  const result = buildSigningDayRecap({ recruitingProspects: [
    { name: 'Unknown Rating', team: 'Team A', season: 1, stars: 0, status: 'Signed', position: 'OL' }
  ] }, 1);
  assert.equal(result.teams[0].topProspect, null);
  assert.deepEqual(result.teams[0].starDistribution, {});
  assert.deepEqual(result.teams[0].positionCounts, { OL: 1 });
});
