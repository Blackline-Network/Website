const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadDatabase, saveDatabase } = require('../utils/league');
const { appendAuditEntry } = require('../utils/operations');
const { FOCUSES, setPlayerDevelopment, previewDevelopment, applyDevelopment } = require('../utils/playerDevelopment');

const MANAGER_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager').split(',').map(x => x.trim()).filter(Boolean);
function isManager(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return !!interaction.member?.roles?.cache?.some(role => MANAGER_ROLES.includes(role.name) || MANAGER_ROLES.includes(role.id));
}
function findActiveDynasty(database, name) {
  const key = String(name || '').trim().toLocaleLowerCase();
  return (database.dynasties || []).find(d => d.status === 'active' && String(d.name || '').trim().toLocaleLowerCase() === key);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('development')
    .setDescription('Staff tools for player ratings and offseason development.')
    .addSubcommand(s => s.setName('set').setDescription('Set a roster player’s overall, potential, and focus.')
      .addStringOption(o => o.setName('dynasty').setDescription('Active dynasty name').setRequired(true))
      .addStringOption(o => o.setName('player').setDescription('Player full name').setRequired(true))
      .addStringOption(o => o.setName('team').setDescription('Player team').setRequired(true))
      .addIntegerOption(o => o.setName('overall').setDescription('Current overall rating (40–99)').setRequired(true).setMinValue(40).setMaxValue(99))
      .addIntegerOption(o => o.setName('potential').setDescription('Potential ceiling (40–99)').setRequired(true).setMinValue(40).setMaxValue(99))
      .addStringOption(o => o.setName('focus').setDescription('Development focus').setRequired(true).addChoices(...FOCUSES.map(v => ({ name: v, value: v })))) )
    .addSubcommand(s => s.setName('review').setDescription('Preview current-season player development without changing data.')
      .addStringOption(o => o.setName('dynasty').setDescription('Active dynasty name').setRequired(true)))
    .addSubcommand(s => s.setName('apply').setDescription('Apply reviewed player development after season close.')
      .addStringOption(o => o.setName('dynasty').setDescription('Active dynasty name').setRequired(true))
      .addBooleanOption(o => o.setName('confirm').setDescription('Confirm applying development').setRequired(true))),

  async execute(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content: '🔒 This command is restricted to league managers.', ephemeral: true });
    const database = loadDatabase();
    const dynastyName = interaction.options.getString('dynasty');
    const dynasty = findActiveDynasty(database, dynastyName);
    if (!dynasty) return interaction.reply({ content: `❌ No active dynasty named **${dynastyName}** was found.`, ephemeral: true });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set') {
      const result = setPlayerDevelopment(dynasty, {
        name: interaction.options.getString('player'), team: interaction.options.getString('team'),
        overall: interaction.options.getInteger('overall'), potential: interaction.options.getInteger('potential'),
        focus: interaction.options.getString('focus')
      }, interaction.user.id);
      if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      appendAuditEntry(dynasty, { action: 'player-development-settings-updated', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { player: result.player.name, team: result.player.team, overall: result.player.development.overall, potential: result.player.development.potential, focus: result.player.development.focus } });
      saveDatabase(database);
      return interaction.reply({ content: `✅ Development profile updated for **${result.player.name}** (${result.player.team}): **${result.player.development.overall} OVR / ${result.player.development.potential} POT**, focus **${result.player.development.focus}**. The public Team Rosters view displays the current OVR.`, ephemeral: true });
    }

    if (subcommand === 'review') {
      const plan = previewDevelopment(dynasty);
      const lines = plan.players.slice(0, 20).map(p => `**${p.name}** (${p.team}) · ${p.overall} → ${p.newOverall} OVR / ${p.potential} POT · +${p.gain}`);
      const warning = !dynasty.seasonClosed ? '\n⚠️ Close the season before applying development.' : '';
      return interaction.reply({ content: `📈 **${dynasty.name} — Player Development Review**\nSeason: **${plan.season}** · Rated players: **${plan.players.length}** · Unrated players: **${plan.unrated}** · Potential points gained: **${plan.totalGain}**\n${lines.join('\n') || 'No players have development ratings yet.'}\n\nStatus: **${plan.alreadyApplied ? 'Already applied this season' : 'Preview only — no changes made'}**${warning}`, ephemeral: true });
    }

    if (subcommand === 'apply') {
      if (!interaction.options.getBoolean('confirm')) return interaction.reply({ content: '❌ Set confirm:true to apply development. No changes were made.', ephemeral: true });
      const result = applyDevelopment(dynasty, interaction.user.id);
      if (result.error) return interaction.reply({ content: `❌ ${result.error} Run the /development review command for ${dynasty.name} first.`, ephemeral: true });
      appendAuditEntry(dynasty, { action: 'player-development-applied', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: result.transition.season, playersImproved: result.transition.playersImproved, totalPointsGained: result.transition.totalPointsGained, unrated: result.unrated } });
      saveDatabase(database);
      return interaction.reply({ content: `✅ **Player development applied for Season ${result.transition.season}.**\nPlayers improved: **${result.transition.playersImproved}** · Total OVR points gained: **${result.transition.totalPointsGained}** · Unrated roster players: **${result.unrated}**. This can only be applied once per season.`, ephemeral: true });
    }
  }
};
