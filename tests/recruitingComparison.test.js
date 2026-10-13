const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRecruitingRankings, calculatePositionNeeds } = require('../utils/recruitingRankings');

test('class comparison data joins signed class scores with position coverage and includes teams without signees', () => {
  const dynasty = {
    season: 3,
    teams: ['Alabama', 'Auburn'],
    rosterPlayers: [
      { team: 'Alabama', position: 'QB', name: 'QB One' },
      { team: 'Auburn', position: 'RB', name: 'RB One' }
    ],
    recruitingProspects: [
      { team: 'Alabama', name: 'QB Prospect', position: 'QB', stars: 5, status: 'Signed', season: 3 },
      { team: 'Alabama', name: 'WR Prospect', position: 'WR', stars: 4, status: 'Signed', season: 3 },
      { team: 'Auburn', name: 'RB Interest', position: 'RB', stars: 5, status: 'Interested', season: 3 }
    ]
  };
  const rankings = calculateRecruitingRankings(dynasty);
  const needs = calculatePositionNeeds(dynasty);
  assert.deepEqual(rankings.map(row => [row.team, row.signed, row.starPoints]), [['Alabama', 2, 9]]);
  assert.equal(needs.find(row => row.team === 'Alabama').positions.QB.signedCount, 1);
  assert.equal(needs.find(row => row.team === 'Auburn').positions.RB.signedCount, 0);
  assert.ok(needs.some(row => row.team === 'Auburn'), 'teams without signed prospects remain available for comparison');
});
