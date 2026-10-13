'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeChangedPanelReferences } = require('../utils/panelState');

test('panel state merge keeps concurrent references when this refresh did not change them', () => {
  const initial = { scheduleChannelId: 'old-channel', scheduleMessageId: 'old-message', competitionMessageId: 'competition-1' };
  const refreshed = { ...initial, scheduleChannelId: 'recovered-channel' };
  const latest = { ...initial, scheduleMessageId: 'newer-message', competitionMessageId: 'newer-competition' };
  const result = mergeChangedPanelReferences(initial, refreshed, latest);
  assert.equal(result.dynasty.scheduleChannelId, 'recovered-channel');
  assert.equal(result.dynasty.scheduleMessageId, 'newer-message');
  assert.equal(result.dynasty.competitionMessageId, 'newer-competition');
  assert.deepEqual(result.changedKeys, ['scheduleChannelId']);
});

test('panel state merge permits explicit clearing of a stale reference', () => {
  const result = mergeChangedPanelReferences({ teamMessageId: 'deleted' }, { teamMessageId: null }, { teamMessageId: 'deleted' });
  assert.equal(result.dynasty.teamMessageId, null);
  assert.deepEqual(result.changedKeys, ['teamMessageId']);
});

test('panel state merge does not mutate the latest database record', () => {
  const latest = { dashboardMessageId: 'current' };
  mergeChangedPanelReferences({ dashboardMessageId: 'old' }, { dashboardMessageId: 'new' }, latest);
  assert.equal(latest.dashboardMessageId, 'current');
});

test('competition center refresh cannot overwrite a newer saved reference when its own reference did not change', () => {
  const initial = { competitionChannelId: 'channel-old', competitionMessageId: 'message-old' };
  const refreshed = { ...initial };
  const latest = { competitionChannelId: 'channel-new', competitionMessageId: 'message-new' };
  const result = mergeChangedPanelReferences(initial, refreshed, latest);
  assert.equal(result.dynasty.competitionChannelId, 'channel-new');
  assert.equal(result.dynasty.competitionMessageId, 'message-new');
  assert.deepEqual(result.changedKeys, []);
});
