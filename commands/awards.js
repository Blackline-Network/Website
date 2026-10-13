'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { loadDatabase, findDynasty } = require('../utils/league');
const { reviewSeasonAwards } = require('../utils/seasonAwards');

const MANAGER_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager')
  .split(',').map(role => role.trim()).filter(Boolean);
function isManager(interaction) {
  if (interaction.memberPermissions?.has('Administrator')) return true;
  const roles = interaction.member?.roles?.cache;
  return !!roles && roles.some(role => MANAGER_ROLES.includes(role.name) || MANAGER_ROLES.includes(role.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('awards')
    .setDescription('Staff tools for reviewing BLACKLINE end-of-season honors.')
    .addSubcommand(s => s.setName('review').setDescription('Review recorded honors and possible duplicates for a season.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
      .addIntegerOption(o => o.setName('season').setDescription('Season to review (defaults to current season)').setRequired(false).setMinValue(1).setMaxValue(100))),
  async execute(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content: '🔒 Awards administration is restricted to league managers and administrators.', ephemeral: true });
    const name = interaction.options.getString('name').trim();
    const database = loadDatabase();
    const dynasty = findDynasty(database, name);
    if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });
    const season = interaction.options.getInteger('season') ?? Number(dynasty.season);
    const review = reviewSeasonAwards(dynasty, season);
    const checklist = review.checklist.map(item => `${item.recorded ? '✅' : '⬜'} ${item.label}`).join('\n');
    const entries = review.entries.slice(0, 18).map(item => `• **${item.category}:** ${item.name || '⚠️ Missing recipient'}${item.team ? ` — ${item.team}` : ''}${item.detail ? ` (${item.detail})` : ''}`).join('\n') || 'No historical honors are recorded for this season yet.';
    const findings = review.findings.slice(0, 10).map(item => `${item.code === 'duplicate' ? '⚠️' : '❌'} ${item.message}`).join('\n') || 'No duplicate-looking or missing-recipient entries found.';
    const content = `🏆 **${dynasty.name} — Season ${season} Awards Review**\nRecords found: **${review.counts.records}** · Errors: **${review.counts.errors}** · Warnings: **${review.counts.warnings}**\n\n**Honors checklist**\n${checklist}\n\n**Recorded honors**\n${entries}\n\n**Integrity review**\n${findings}\n\nRead-only review. Missing checklist items are reminders, not errors; record only honors your league actually awards using the existing /league history-record workflow.`.slice(0, 1950);
    return interaction.reply({ content, ephemeral: true });
  }
};
