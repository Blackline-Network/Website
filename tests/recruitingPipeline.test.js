const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRecruitingPipeline } = require('../utils/recruitingRankings');

test('pipeline counts current-season prospects by recorded status without counting other seasons', () => {
  const dynasty = {
    season: 4,
    teams: ['Alabama', 'Auburn'],
    recruitingProspects: [
      { team: 'Alabama', name: 'A', position: 'QB', stars: 5, status: 'Interested', season: 4 },
      { team: 'Alabama', name: 'B', position: 'WR', stars: 4, status: 'Committed', season: 4 },
      { team: 'Alabama', name: 'C', position: 'RB', stars: 3, status: 'Signed', season: 4 },
      { team: 'Auburn', name: 'D', position: 'CB', stars: 4, status: 'offered', season: 4 },
      { team: 'Auburn', name: 'Old', position: 'LB', stars: 5, status: 'Signed', season: 3 }
    ]
  };
  const rows = calculateRecruitingPipeline(dynasty);
  const alabama = rows.find(row => row.team === 'Alabama');
  const auburn = rows.find(row => row.team === 'Auburn');
  assert.equal(alabama.total, 3);
  assert.equal(alabama.statuses.Interested, 1);
  assert.equal(alabama.statuses.Committed, 1);
  assert.equal(alabama.statuses.Signed, 1);
  assert.equal(auburn.statuses.Offered, 1);
  assert.equal(auburn.statuses.Signed, 0);
});

test('pipeline includes teams with no prospects and preserves unrecognized statuses under Other', () => {
  const rows = calculateRecruitingPipeline({ season: 1, teams: ['No Recruits'], recruitingProspects: [
    { team: 'Mystery U', name: 'Prospect', status: 'Evaluating', season: 1 }
  ] });
  assert.equal(rows.find(row => row.team === 'No Recruits').total, 0);
  assert.equal(rows.find(row => row.team === 'Mystery U').statuses.Other, 1);
});
