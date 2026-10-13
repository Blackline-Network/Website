'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planTeamSelectionRepair, applyTeamSelectionRepair } = require('../utils/teamSelectionRepair');

test('repair plan keeps first valid claim and classifies inconsistent records without mutation', () => {
  const dynasty = {
    game: 'custom', teamPool: ['Alpha', 'Beta'],
    teamSelections: [
      { team: 'Alpha', userId: 'u1' },
      { team: ' alpha ', userId: 'u2' },
      { team: 'Outside', userId: 'u3' },
      { team: 'Beta', userId: 'u1' },
      { team: 'Beta', userId: 'u4' },
      { team: 'Alpha', userId: '' }
    ]
  };
  const before = JSON.stringify(dynasty);
  const plan = planTeamSelectionRepair(dynasty);
  assert.equal(JSON.stringify(dynasty), before);
  assert.equal(plan.kept.length, 2);
  assert.deepEqual(plan.removed.map(x => x.reason), [
    'duplicate_team', 'invalid_team', 'multiple_teams_for_user', 'duplicate_team'
  ]);
  assert.equal(plan.counts.duplicate_team, 2);
  assert.equal(plan.counts.invalid_team, 1);
  assert.equal(plan.counts.multiple_teams_for_user, 1);
});

test('repair application changes only the selection array and reports totals', () => {
  const dynasty = { game: 'custom', teamPool: ['Alpha'], teamSelections: [{ team: 'Alpha', userId: 'u1' }, { team: 'Bad', userId: 'u2' }] };
  const plan = planTeamSelectionRepair(dynasty);
  const result = applyTeamSelectionRepair(dynasty, plan);
  assert.deepEqual(result, { removed: 1, remaining: 1 });
  assert.deepEqual(dynasty.teamSelections, [{ team: 'Alpha', userId: 'u1' }]);
});

test('repair plan does not create a missing selection array during preview', () => {
  const dynasty = { game: 'custom', teamPool: ['Alpha'] };
  const plan = planTeamSelectionRepair(dynasty);
  assert.equal(plan.total, 0);
  assert.equal(Object.hasOwn(dynasty, 'teamSelections'), false);
});
