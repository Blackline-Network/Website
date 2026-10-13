
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const PANEL_TITLE = 'BLACKLINE Creator Connections';
const DEFAULT_CHANNEL_NAME = '🎥・media';

function buildCreatorConnectionsPanel(websiteUrl) {
  const base = String(websiteUrl || '').trim().replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(base)) {
    throw new Error(
      'BLACKLINE_WEBSITE_URL must be an absolute http(s) URL.'
    );
  }

  const connectUrl = new URL(
    '/creator-connections.html',
    base
  ).toString();

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(PANEL_TITLE)
    .setDescription([
      '**Connect your stream to the BLACKLINE community.**',
      '',
      'Link your own Twitch account securely, then manage your connection from the BLACKLINE website.',
      '',
      '• **Connect Twitch** — authorize your Twitch account with Twitch directly.',
      '• **My Connection** — check which account is linked.',
      '• **Disconnect** — remove your link whenever you want.',
      '',
      'Account linking requires Discord sign-in and a configured Twitch developer app. Linking alone does not automatically enable stream announcements.',
    ].join('\n'))
    .setFooter({
      text: 'BLACKLINE • Creator Connections',
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Connect / Manage Twitch')
      .setStyle(ButtonStyle.Link)
      .setURL(connectUrl)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

async function syncCreatorConnectionsPanel(client, options = {}) {
  const channelName = String(
    options.channelName ||
    process.env.CREATOR_CONNECTIONS_CHANNEL_NAME ||
    DEFAULT_CHANNEL_NAME
  ).trim();

  const websiteUrl = String(
    options.websiteUrl ||
    process.env.BLACKLINE_WEBSITE_URL ||
    ''
  ).trim();

  if (!websiteUrl) {
    console.warn(
      '[Creator Connections] Skipped: set BLACKLINE_WEBSITE_URL in .env.'
    );
    return { ok: false, reason: 'missing_website_url' };
  }

  let updated = 0;

  for (const guild of client.guilds.cache.values()) {
    try {
      // Prefer the configured channel name; fall back to a channel ID.
      const configuredChannelId = String(
        options.channelId ||
        process.env.CREATOR_CONNECTIONS_CHANNEL_ID ||
        ''
      ).trim();

      let channel = configuredChannelId
        ? guild.channels.cache.get(configuredChannelId)
        : null;

      if (!channel) {
        channel = guild.channels.cache.find(
          c =>
            c.name === channelName &&
            c.type === ChannelType.GuildText
        );
      }

      if (!channel) {
        console.error(
          `[Creator Connections] Channel not found in "${guild.name}". ` +
          `Configured name="${channelName}". ` +
          `Set CREATOR_CONNECTIONS_CHANNEL_ID to the channel's actual ID if needed.`
        );
        continue;
      }

      const me = guild.members.me;
      const permissions = me
        ? channel.permissionsFor(me)
        : null;

      if (
        !permissions ||
        !permissions.has(PermissionsBitField.Flags.ViewChannel) ||
        !permissions.has(PermissionsBitField.Flags.SendMessages) ||
        !permissions.has(PermissionsBitField.Flags.EmbedLinks)
      ) {
        console.error(
          `[Creator Connections] Missing View Channel, Send Messages, ` +
          `or Embed Links permission in #${channel.name} (${guild.name}).`
        );
        continue;
      }

      const payload = buildCreatorConnectionsPanel(websiteUrl);
      let existing = null;

      if (channel.messages?.fetch) {
        const messages = await channel.messages
          .fetch({ limit: 100 })
          .catch(error => {
            console.warn(
              `[Creator Connections] Could not inspect recent messages in ` +
              `#${channel.name}: ${error.message}`
            );
            return null;
          });

        existing = messages?.find(
          message =>
            message.author?.id === client.user.id &&
            message.embeds?.some(
              embed => embed.title === PANEL_TITLE
            )
        ) || null;
      }

      const message = existing
        ? await existing.edit(payload)
        : await channel.send(payload);

      // Verify Discord returned a real message and that it can be fetched.
      if (!message?.id) {
        throw new Error('Discord did not return a message ID.');
      }

      const verifiedMessage = await channel.messages.fetch(message.id);

      if (!verifiedMessage) {
        throw new Error(
          `Could not fetch sent message ${message.id} for verification.`
        );
      }

      updated++;

      console.log(
        `[Creator Connections] VERIFIED ${existing ? 'REFRESHED' : 'PUBLISHED'} ` +
        `guild="${guild.name}" guildId=${guild.id} ` +
        `channel="#${channel.name}" channelId=${channel.id} ` +
        `messageId=${verifiedMessage.id} ` +
        `url=https://discord.com/channels/${guild.id}/${channel.id}/${verifiedMessage.id}`
      );
    } catch (error) {
      console.error(
        `[Creator Connections] FAILED in guild "${guild.name}" (${guild.id}):`,
        error.stack || error.message || error
      );
    }
  }

  if (!updated) {
    console.error(
      '[Creator Connections] No panel was verified. Check the channel name/ID, ' +
      'bot permissions, and the errors above.'
    );
  }

  return {
    ok: updated > 0,
    updated,
  };
}

module.exports = {
  PANEL_TITLE,
  DEFAULT_CHANNEL_NAME,
  buildCreatorConnectionsPanel,
  syncCreatorConnectionsPanel,
};
