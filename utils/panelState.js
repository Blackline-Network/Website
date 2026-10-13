'use strict';

const PANEL_REFERENCE_KEYS = Object.freeze([
  'guildId', 'categoryId', 'dashboardChannelId', 'dashboardMessageId',
  'scheduleChannelId', 'scheduleMessageId', 'competitionChannelId', 'competitionMessageId',
  'historyChannelId', 'historyMessageId', 'coachCenterChannelId', 'coachCenterMessageId',
  'teamChannelId', 'teamMessageId'
]);

// Merge only references changed by this refresh. Unchanged values come from the
// latest database snapshot, so an older in-memory dynasty cannot overwrite a
// newer panel reference written by another workflow.
function mergeChangedPanelReferences(initial, refreshed, latest) {
  const merged = { ...latest };
  const changedKeys = [];
  for (const key of PANEL_REFERENCE_KEYS) {
    if (refreshed?.[key] !== initial?.[key]) {
      if (refreshed?.[key] === undefined) delete merged[key];
      else merged[key] = refreshed[key];
      changedKeys.push(key);
    }
  }
  return { dynasty: merged, changedKeys };
}

module.exports = { PANEL_REFERENCE_KEYS, mergeChangedPanelReferences };
