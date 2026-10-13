const { SlashCommandBuilder } = require('discord.js');
const { loadDatabase, saveDatabase, findDynasty, updateDashboardMessage } = require('../utils/league');
const { refreshSchedulePanel } = require('./dynasty');
const { refreshCompetitionPanel, refreshHistoryPanel, refreshCoachCenterPanel } = require('./league');
const { refreshPanel: refreshTeamPanel } = require('./teams');
const { syncPanel: syncDisputePanel } = require('./dispute');
const { configuredManagerRoles, hasManagerAccess } = require('../utils/accessControl');
const { respondToInteraction } = require('../utils/interactionResponse');
const { diagnosePanelFailure } = require('../utils/panelDiagnostics');
const { mergeChangedPanelReferences } = require('../utils/panelState');
const MANAGER_ROLES = configuredManagerRoles();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panels')
    .setDescription('Refresh BLACKLINE public panels.')
    .addSubcommand(sub => sub
      .setName('refresh')
      .setDescription('Refresh every existing panel for a dynasty in one operation.')
      .addStringOption(option => option
        .setName('name')
        .setDescription('Exact dynasty name')
        .setRequired(true))),

  async execute(interaction) {
    if (!hasManagerAccess(interaction, MANAGER_ROLES)) return respondToInteraction(interaction, { content: `🔒 Panel refresh requires one of these roles: **${MANAGER_ROLES.join('**, **')}**.`, ephemeral: true });
    const database = loadDatabase();
    const name = interaction.options.getString('name', true).trim();
    const dynasty = findDynasty(database, name);
    if (!dynasty || dynasty.status !== 'active') {
      return respondToInteraction(interaction, { content: `❌ Active dynasty **${name}** was not found. Check the exact name and try again.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    // Track the pre-refresh snapshot so only references actually recovered by
    // this run can be merged back; never copy stale, unchanged IDs over newer data.
    const initialReferences = { ...dynasty };
    const results = [];
    const run = async (label, task) => {
      try {
        const ok = await task();
        results.push({ label, ok: ok === true, detail: ok === true ? null : await diagnosePanelFailure(interaction.client, dynasty, label) });
      } catch (error) {
        console.error(`Bulk panel refresh failed (${label}) for ${dynasty.name}:`, error);
        results.push({ label, ok: false, detail: error?.message || 'Unexpected refresh error; inspect the bot log.' });
      }
    };

    await run('Schedule / readiness', () => refreshSchedulePanel(interaction.client, dynasty));
    await run('Competition Center', () => refreshCompetitionPanel(interaction.client, dynasty));
    await run('League History', () => refreshHistoryPanel(interaction.client, dynasty));
    await run('Coach Center', () => refreshCoachCenterPanel(interaction.client, dynasty));
    await run('Team Selection', () => refreshTeamPanel(interaction.client, dynasty, 0));
    // Refresh the Hub last so its link buttons use any panel IDs recovered above.
    await run('League Hub dashboard', () => updateDashboardMessage(interaction.client, dynasty, database));

    // The support/dispute panel is guild-wide, not dynasty-specific. Sync it once
    // without creating duplicate posts when a matching panel already exists.
    if (interaction.guild) await run('Dispute Center', () => syncDisputePanel(interaction.client, interaction.guild));

    // Refresh helpers may persist their own recovered IDs. Merge only the panel
    // references back into the latest database so this command cannot overwrite
    // fresher state with the stale snapshot loaded before Discord API calls.
    const latest = loadDatabase();
    const latestDynasty = findDynasty(latest, dynasty.name);
    if (latestDynasty) {
      const merged = mergeChangedPanelReferences(initialReferences, dynasty, latestDynasty);
      if (merged.changedKeys.length) {
        Object.assign(latestDynasty, Object.fromEntries(merged.changedKeys.map(key => [key, merged.dynasty[key]])));
        saveDatabase(latest);
      }
    }
    const updated = results.filter(item => item.ok);
    const skipped = results.filter(item => !item.ok);
    const details = [
      `✅ **Refreshed ${updated.length} of ${results.length} panel(s)** for **${dynasty.name}**.`,
      updated.length ? `**Updated**\n${updated.map(item => `• ${item.label}`).join('\n')}` : '',
      skipped.length ? `**Not updated**\n${skipped.map(item => `• **${item.label}:** ${item.detail || 'Refresh returned no success result.'}`).join('\n')}` : '',
      '\nRefresh only edits an existing panel; it will not create a duplicate. Use the existing setup command for a panel that truly does not exist.'
    ].filter(Boolean).join('\n\n');
    return respondToInteraction(interaction, { content: details, allowedMentions: { parse: [] } });
  }
};
