const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { loadDatabase, saveDatabase, findDynasty } = require('../utils/league');
const { appendAuditEntry } = require('../utils/operations');
const { EVENT_TYPES, ensureNotificationSettings } = require('../utils/leagueNotifications');

const MANAGER_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager').split(',').map(role => role.trim()).filter(Boolean);
function isManager(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = interaction.member?.roles?.cache;
  return !!roles && roles.some(role => MANAGER_ROLES.includes(role.name) || MANAGER_ROLES.includes(role.id));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Configure public BLACKLINE league event announcements.')
    .addSubcommand(s => s.setName('channel').setDescription('Staff: set the public announcement channel.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Text channel for public announcements').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('event').setDescription('Staff: enable or disable an announcement category.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
      .addStringOption(o => o.setName('event').setDescription('Announcement category').setRequired(true).addChoices(
        { name: 'Final scores', value: 'score' }, { name: 'Score corrections', value: 'correction' },
        { name: 'Playoff results', value: 'playoff' }, { name: 'Championships', value: 'champion' },
        { name: 'Offseason transitions', value: 'offseason' }, { name: 'Awards and honors', value: 'award' },
        { name: 'Recruiting signings', value: 'signing' }
      ))
      .addBooleanOption(o => o.setName('enabled').setDescription('Whether this category is enabled').setRequired(true)))
    .addSubcommand(s => s.setName('test').setDescription('Staff: send a test message to the configured announcement channel.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))),

  async execute(interaction) {
    if (!isManager(interaction)) return interaction.reply({ content: '🔒 Only league staff can configure announcement settings.', ephemeral: true });
    const database = loadDatabase();
    const name = interaction.options.getString('name').trim();
    const dynasty = findDynasty(database, name);
    if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'channel') {
      const channel = interaction.options.getChannel('channel');
      if (!channel || channel.type !== ChannelType.GuildText || !channel.isTextBased()) return interaction.reply({ content: '❌ Choose a standard text channel in this server.', ephemeral: true });
      ensureNotificationSettings(dynasty).channelId = channel.id;
      appendAuditEntry(dynasty, { action: 'notification-channel-configured', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { channelId: channel.id } });
      saveDatabase(database);
      return interaction.reply({ content: `✅ Public announcements for **${dynasty.name}** will use ${channel}. Configure categories with /notifications event.`, ephemeral: true });
    }

    if (subcommand === 'event') {
      const eventType = interaction.options.getString('event');
      const enabled = interaction.options.getBoolean('enabled');
      ensureNotificationSettings(dynasty).events[eventType] = enabled;
      appendAuditEntry(dynasty, { action: 'notification-event-setting-changed', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { eventType, enabled } });
      saveDatabase(database);
      return interaction.reply({ content: `✅ **${EVENT_TYPES[eventType]}** announcements are now **${enabled ? 'enabled' : 'disabled'}** for **${dynasty.name}**.`, ephemeral: true });
    }

    if (subcommand === 'test') {
      const settings = ensureNotificationSettings(dynasty);
      if (!settings.channelId) return interaction.reply({ content: '❌ Set an announcement channel first with `/notifications channel`.', ephemeral: true });
      const channel = await interaction.client.channels.fetch(settings.channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') return interaction.reply({ content: '❌ The configured channel is unavailable or not text-based. Configure it again.', ephemeral: true });
      try {
        await channel.send({ embeds: [new EmbedBuilder().setColor(0x243447).setTitle(`🔔 ${dynasty.name} · Notification Test`).setDescription('League announcements are configured. This channel will receive enabled event categories.').setFooter({ text: 'BLACKLINE League Updates' }).setTimestamp()], allowedMentions: { parse: [] } });
      } catch (_) {
        return interaction.reply({ content: '❌ I could not post there. Check the bot has View Channel, Send Messages, and Embed Links permissions.', ephemeral: true });
      }
      return interaction.reply({ content: `✅ Test announcement sent to ${channel}.`, ephemeral: true });
    }
  }
};
