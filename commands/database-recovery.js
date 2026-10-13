'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { saveDatabase } = require('../utils/league');
const { verifyDatabaseBackup, restoreDatabaseBackup, appendAuditEntry } = require('../utils/operations');
const MANAGER_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager').split(',').map(s => s.trim()).filter(Boolean);
function isManager(interaction) {
  const roles = interaction.member?.roles?.cache;
  return !!roles && roles.some(role => MANAGER_ROLES.includes(role.name) || MANAGER_ROLES.includes(role.id));
}
module.exports = {
  data: new SlashCommandBuilder()
    .setName('database-recovery')
    .setDescription('Staff-only database backup validation and recovery tools.')
    .addSubcommand(s => s.setName('verify').setDescription('Validate a saved database backup without restoring it.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name for staff authorization').setRequired(true))
      .addStringOption(o => o.setName('file').setDescription('Exact filename from /league backup-list').setRequired(true)))
    .addSubcommand(s => s.setName('restore').setDescription('Restore a validated backup after preserving current data.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name for staff authorization').setRequired(true))
      .addStringOption(o => o.setName('file').setDescription('Exact filename from /league backup-list').setRequired(true))
      .addBooleanOption(o => o.setName('confirm').setDescription('Confirm replacement of the shared database for all dynasties').setRequired(true))),
  async execute(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content: `🔒 Database recovery requires one of these roles: **${MANAGER_ROLES.join('**, **')}**.`, ephemeral: true });
    const name = interaction.options.getString('name', true).trim();
    const subcommand = interaction.options.getSubcommand();
    const fileName = interaction.options.getString('file', true).trim();
    if (subcommand === 'verify') {
      const result = verifyDatabaseBackup(fileName);
      const lines = result.valid ? [
        `✅ **Backup passed structural validation:** \`${fileName}\``,
        `Dynasties: **${result.summary.dynasties}** · Coaches: **${result.summary.coaches}** · Size: **${result.bytes.toLocaleString()} bytes**`,
        ...(result.warnings.length ? [`Warnings:\n${result.warnings.slice(0, 8).map(w => `• ${w}`).join('\n')}`] : ['No structural warnings found.']),
        'This checks structure, not the factual accuracy of recorded scores or history.'
      ] : [`❌ **Backup failed validation:** \`${fileName}\``, ...result.errors.slice(0, 8).map(e => `• ${e}`)];
      return interaction.reply({ content: lines.join('\n').slice(0, 1900), ephemeral: true });
    }
    if (subcommand === 'restore') {
      if (!interaction.options.getBoolean('confirm', true)) return interaction.reply({ content: '❌ Restore cancelled. Set **confirm** to true only after reviewing the selected backup.', ephemeral: true });
      try {
        const preflight = verifyDatabaseBackup(fileName);
        if (!preflight.valid) return interaction.reply({ content: `❌ Restore refused: ${preflight.errors.join(' ').slice(0, 900)}`, ephemeral: true });
        const selectedDynastyExists = preflight.database.dynasties.some(d => String(d.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        if (!selectedDynastyExists) return interaction.reply({ content: `❌ The selected backup does not contain dynasty **${name}**. Nothing was changed.`, ephemeral: true });
        const restored = restoreDatabaseBackup(fileName);
        const restoredDynasty = restored.database.dynasties.find(d => String(d.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        if (restoredDynasty) {
          appendAuditEntry(restoredDynasty, { action: 'database-backup-restored', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { file: fileName, bytes: restored.bytes } });
          saveDatabase(restored.database);
        }
        const warningText = restored.warnings.length ? `\nWarnings: ${restored.warnings.slice(0, 3).join(' | ')}` : '';
        return interaction.reply({ content: `✅ Restored and revalidated **${fileName}**. This replaced the shared database for all dynasties. A pre-restore snapshot was preserved when a live file existed. Dynasties: **${restored.summary.dynasties}** · Coaches: **${restored.summary.coaches}**.${warningText}`, ephemeral: true });
      } catch (error) {
        console.error('Database backup restore failed:', error);
        return interaction.reply({ content: `❌ Restore was not completed. ${String(error.message || error).slice(0, 900)}`, ephemeral: true });
      }
    }
  }
};
