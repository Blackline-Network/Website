'use strict';

function isTextChannel(channel, guildId) {
  return !!channel && typeof channel.isTextBased === 'function' && channel.isTextBased() &&
    (!guildId || channel.guild?.id === guildId) && !!channel.messages?.fetch;
}

async function resolveGuild(client, dynasty, savedChannel) {
  if (dynasty.guildId) {
    const guild = await client.guilds.fetch(dynasty.guildId).catch(() => null);
    if (guild) return guild;
  }
  if (savedChannel?.guild) return savedChannel.guild;
  return null;
}

async function recoverPanelTarget(client, dynasty, options) {
  const { channelKey, messageKey, channelNames = [], channelNamePattern, matchesMessage } = options;
  const savedChannel = dynasty[channelKey]
    ? await client.channels.fetch(dynasty[channelKey]).catch(() => null)
    : null;
  const guild = await resolveGuild(client, dynasty, savedChannel);
  if (!guild) return { channel: null, message: null, recovered: false, reason: 'guild-unavailable' };

  const candidates = [];
  if (isTextChannel(savedChannel, guild.id)) candidates.push(savedChannel);
  const fetchedChannels = await guild.channels.fetch().catch(() => null);
  const channels = fetchedChannels || guild.channels.cache;
  const alternatives = [...channels.values()].filter(item => {
    if (!isTextChannel(item, guild.id) || candidates.some(existing => existing.id === item.id)) return false;
    const name = String(item.name || '');
    return channelNames.includes(name) || (channelNamePattern && channelNamePattern.test(name));
  });
  // Prefer the configured category, but still recover a panel if its channel was moved.
  alternatives.sort((a, b) => Number(b.parentId === dynasty.categoryId) - Number(a.parentId === dynasty.categoryId));
  candidates.push(...alternatives);
  if (!candidates.length) return { channel: null, message: null, recovered: false, reason: 'channel-unavailable' };

  let channel = null;
  let message = null;
  for (const candidate of candidates) {
    let found = candidate.id === dynasty[channelKey] && dynasty[messageKey]
      ? await candidate.messages.fetch(dynasty[messageKey]).catch(() => null)
      : null;
    if (found && (found.author?.id !== client.user?.id || !matchesMessage(found))) found = null;
    if (!found) {
      const recent = await candidate.messages.fetch({ limit: 100 }).catch(() => null);
      found = recent?.find(item => item.author?.id === client.user?.id && matchesMessage(item)) || null;
    }
    if (found) {
      channel = candidate;
      message = found;
      break;
    }
  }
  if (!channel) channel = candidates[0];
  if (!message) return { channel, message: null, recovered: false, reason: 'message-unavailable' };

  const changed = dynasty[channelKey] !== channel.id || dynasty[messageKey] !== message.id || dynasty.guildId !== guild.id;
  dynasty.guildId = guild.id;
  dynasty[channelKey] = channel.id;
  dynasty[messageKey] = message.id;
  if (changed) persistPanelReferences(dynasty, [channelKey, messageKey]);
  return { channel, message, recovered: changed, reason: null };
}

function persistPanelReferences(dynasty, keys) {
  try {
    // Lazy load avoids a startup cycle: utils/league imports the dashboard, and
    // panel refreshers are themselves imported by the league command module.
    const { loadDatabase, saveDatabase } = require('./league');
    const database = loadDatabase();
    const sameName = database.dynasties.filter(item =>
      String(item.name || '').toLowerCase() === String(dynasty.name || '').toLowerCase());
    // If the active dynasty has a guild ID, never bind its recovered references
    // to a different guild's record. A legacy record without a guild ID is only
    // safe to select when the name is unambiguous.
    const stored = dynasty.guildId
      ? (sameName.find(item => item.guildId === dynasty.guildId) ||
        (sameName.length === 1 && !sameName[0].guildId ? sameName[0] : null))
      : (sameName.length === 1 ? sameName[0] : null);
    if (!stored) return false;
    stored.guildId = dynasty.guildId || stored.guildId;
    for (const key of keys) if (dynasty[key] !== undefined && dynasty[key] !== null) stored[key] = dynasty[key];
    saveDatabase(database);
    return true;
  } catch (error) {
    console.error(`Could not persist recovered panel references for ${dynasty.name}:`, error);
    return false;
  }
}

module.exports = { recoverPanelTarget, persistPanelReferences, isTextChannel };
