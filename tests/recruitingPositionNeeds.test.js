const test = require('node:test');
const assert = require('node:assert/strict');
const { calculatePositionNeeds } = require('../utils/recruitingRankings');

test('flags thin positions without signed coverage and separately reports signed coverage', () => {
  const dynasty = {
    season: 3,
    teams: ['Alabama'],
    rosterPlayers: [
      { team: 'Alabama', position: 'QB' },
      { team: 'Alabama', position: 'WR' }, { team: 'Alabama', position: 'WR' }, { team: 'Alabama', position: 'WR' }
    ],
    recruitingProspects: [
      { team: 'Alabama', position: 'QB', season: 3, status: 'Signed', stars: 4 },
      { team: 'Alabama', position: 'RB', season: 3, status: 'Committed', stars: 5 },
      { team: 'Alabama', position: 'CB', season: 2, status: 'Signed', stars: 4 }
    ]
  };
  const [row] = calculatePositionNeeds(dynasty);
  assert.equal(row.positions.QB.rosterCount, 1);
  assert.equal(row.positions.QB.signedCount, 1);
  assert.equal(row.positions.QB.priority, 'Addressed by signed class');
  assert.equal(row.positions.RB.signedCount, 0, 'commitments do not count as signed coverage');
  assert.equal(row.positions.RB.priority, 'High');
  assert.equal(row.positions.WR.depth, 'Moderate');
  assert.equal(row.positions.CB.signedCount, 0, 'prior-season signings do not count');
});

test('discovers teams from roster and prospects and uses case-insensitive team matching', () => {
  const rows = calculatePositionNeeds({ season: 1, rosterPlayers: [{ team: 'Alabama', position: 'QB' }], recruitingProspects: [{ team: 'alabama', position: 'QB', season: 1, status: 'Signed', stars: 3 }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].positions.QB.rosterCount, 1);
  assert.equal(rows[0].positions.QB.signedCount, 1);
});
