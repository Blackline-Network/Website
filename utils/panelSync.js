const { loadDatabase, saveDatabase, findDynasty, updateDashboardMessage } = require('./league');
const { mergeChangedPanelReferences } = require('./panelState');

// Re-render the existing dynasty panels after any week/phase advance. This is
// shared by scheduled and manual advances so neither path can leave stale week
// labels or advance timestamps behind.
async function refreshDynastyPanels(client, dynastyName, { logger = console } = {}) {
  const database = loadDatabase();
  const dynasty = findDynasty(database, dynastyName);
  if (!dynasty) return { dynasty: dynastyName, refreshed: [], failed: ['Dynasty lookup'], ok: false };

  const refreshed = [];
  const failed = [];
  const initialReferences = { ...dynasty };
  const run = async (label, task) => {
    try {
      const result = await task();
      if (result === true) refreshed.push(label);
      else failed.push(label);
    } catch (error) {
      failed.push(label);
      logger.error?.(`Post-advance panel refresh failed (${label}) for ${dynasty.name}:`, error);
    }
  };

  // Lazy requires avoid startup/module cycles; use the canonical panel renderers.
  const dynastyCommand = require('../commands/dynasty');
  const leagueCommand = require('../commands/league');
  const teamsCommand = require('../commands/teams');

  await run('Schedule / Advance Readiness', () => dynastyCommand.refreshSchedulePanel(client, dynasty));
  await run('Competition Center', () => leagueCommand.refreshCompetitionPanel(client, dynasty));
  await run('League History', () => leagueCommand.refreshHistoryPanel(client, dynasty));
  await run('Coach Center', () => leagueCommand.refreshCoachCenterPanel(client, dynasty));
  await run('Team Selection', () => teamsCommand.refreshPanel(client, dynasty, 0));
  // Hub last, so it uses any panel references recovered during the refreshes.
  await run('League Hub', () => updateDashboardMessage(client, dynasty, database));

  // Refreshers may recover panel IDs. Merge those references into the newest
  // database snapshot, preserving concurrent changes to league state.
  const latest = loadDatabase();
  const stored = findDynasty(latest, dynasty.name);
  if (stored) {
    const merged = mergeChangedPanelReferences(initialReferences, dynasty, stored);
    if (merged.changedKeys.length) {
      Object.assign(stored, Object.fromEntries(merged.changedKeys.map(key => [key, merged.dynasty[key]])));
      saveDatabase(latest);
    }
  }

  if (failed.length) logger.error?.(`Post-advance panel sync for ${dynasty.name}: refreshed ${refreshed.length}; failed ${failed.length}: ${failed.join(', ')}`);
  else logger.log?.(`Post-advance panel sync for ${dynasty.name}: all ${refreshed.length} panels refreshed.`);
  return { dynasty: dynasty.name, refreshed, failed, ok: failed.length === 0 };
}

module.exports = { refreshDynastyPanels };
