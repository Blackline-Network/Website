const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadDatabase, findDynasty } = require('../utils/league');
const { getAdvanceAuditEntries } = require('../utils/advanceAudit');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advance-audit')
    .setDescription('Review week advances and panel refresh outcomes for a dynasty.')
    .addStringOption(option => option.setName('name').setDescription('Exact dynasty name').setRequired(true))
    .addIntegerOption(option => option.setName('entries').setDescription('Number of recent audit entries (1–25)').setMinValue(1).setMaxValue(25)),

  async execute(interaction) {
    const database = loadDatabase();
    const name = interaction.options.getString('name', true).trim();
    const dynasty = findDynasty(database, name);
    if (!dynasty) return interaction.reply({ content: `❌ Dynasty **${name}** was not found.`, ephemeral: true });

    const entries = getAdvanceAuditEntries(dynasty, interaction.options.getInteger('entries') || 12);
    const embed = new EmbedBuilder()
      .setColor(entries.some(entry => (entry.action === 'week-advance-panel-sync' && entry.details?.failedCount !== '0') || entry.action === 'week-advance-blocked') ? 0xE67E22 : 0x2ECC71)
      .setTitle(`⏩ ${dynasty.name} — Weekly Advance Audit`)
      .setDescription(entries.length ? entries.map(entry => {
        const details = entry.details || {};
        const timestamp = Number.isFinite(Date.parse(entry.at)) ? `<t:${Math.floor(Date.parse(entry.at) / 1000)}:f>` : 'Time unavailable';
        if (entry.action === 'week-advance-blocked') {
          return `⛔ **Advance blocked** · ${timestamp}\nSource: ${details.source || 'unknown'} · Actor: <@${entry.actorId}>\n${details.blockers || 'No blocker details recorded.'}`;
        }
        if (entry.action === 'week-advance') {
          return `**Advance** · ${timestamp}\n${details.fromPhase || '?'} (Season ${details.fromSeason || '?'}${details.fromYear && details.fromYear !== '0' ? ` / ${details.fromYear}` : ''}) → **${details.toPhase || '?'}** (Season ${details.toSeason || '?'}${details.toYear && details.toYear !== '0' ? ` / ${details.toYear}` : ''})\nSource: ${details.source || 'unknown'} · Actor: <@${entry.actorId}>`;
        }
        const failedCount = Number(details.failedCount || 0);
        return `${failedCount ? '⚠️' : '✅'} **Panel refresh** · ${timestamp}\n${details.refreshedCount || '0'} refreshed · ${failedCount} failed · Source: ${details.source || 'unknown'}\n${failedCount ? `Failed: ${details.failed || 'not recorded'}` : `Updated: ${details.refreshed || 'not recorded'}`}`;
      }).join('\n\n').slice(0, 4000) : 'No advance audit entries have been recorded yet. New manual and scheduled advances will be logged here.')
      .setFooter({ text: 'Audit history begins with Fix 50; older advances are not reconstructed.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
