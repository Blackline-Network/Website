const test = require('node:test');
const assert = require('node:assert/strict');
const { upsertProspect } = require('../utils/rosterManagement');
const { buildRecruitingHistory } = require('../utils/recruitingHistory');

test('new prospects and status transitions are tracked with actor and timestamps', () => {
  const dynasty = { season: 3, recruitingProspects: [] };
  const base = { name: 'Jordan Smith', team: 'Alabama', position: 'QB', stars: 5, season: 3 };
  const created = upsertProspect(dynasty, { ...base, status: 'Interested' }, 'staff-1');
  assert.equal(created.created, true);
  assert.equal(created.prospect.statusHistory.length, 1);
  assert.equal(created.prospect.statusHistory[0].initial, true);
  assert.equal(created.prospect.statusHistory[0].actorId, 'staff-1');

  upsertProspect(dynasty, { ...base, status: 'Offered' }, 'staff-2');
  assert.equal(created.prospect.statusHistory.length, 2);
  assert.equal(created.prospect.statusHistory[1].fromStatus, 'Interested');
  assert.equal(created.prospect.statusHistory[1].toStatus, 'Offered');
  assert.equal(created.prospect.statusHistory[1].actorId, 'staff-2');
  assert.ok(Number.isFinite(new Date(created.prospect.statusHistory[1].at).getTime()));
});

test('editing non-status prospect details does not create a status event', () => {
  const dynasty = { season: 2, recruitingProspects: [] };
  const prospect = { name: 'Alex', team: 'Auburn', position: 'WR', stars: 3, season: 2, status: 'Committed' };
  upsertProspect(dynasty, prospect, 'staff-1');
  const record = dynasty.recruitingProspects[0];
  upsertProspect(dynasty, { ...prospect, stars: 4 }, 'staff-2');
  assert.equal(record.statusHistory.length, 1);
  assert.equal(record.stars, 4);
});

test('history view filters season and does not invent history for legacy records', () => {
  const dynasty = { season: 4, recruitingProspects: [
    { name: 'Current', team: 'Alabama', position: 'QB', stars: 5, season: 4, status: 'Signed', statusHistory: [
      { fromStatus: 'Committed', toStatus: 'Signed', at: '2026-01-02T00:00:00.000Z', actorId: 'staff' }
    ] },
    { name: 'Legacy', team: 'Auburn', position: 'WR', stars: 3, season: 4, status: 'Offered' },
    { name: 'Old season', team: 'Alabama', position: 'RB', stars: 4, season: 3, status: 'Signed' }
  ] };
  const result = buildRecruitingHistory(dynasty);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].prospect, 'Current');
  assert.equal(result.hasOlderUntrackedRecords, true);
});
