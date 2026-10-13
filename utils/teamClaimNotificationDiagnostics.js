'use strict';

const EVENT_SETTINGS = {
  claims: 'TEAM_CLAIM_NOTIFY_CLAIMS',
  releases: 'TEAM_CLAIM_NOTIFY_RELEASES',
  repairs: 'TEAM_CLAIM_NOTIFY_REPAIRS'
};
const OFF_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

function eventSwitches(env = process.env) {
  return Object.fromEntries(Object.entries(EVENT_SETTINGS).map(([event, key]) => {
    const raw = String(env[key] ?? 'true').trim().toLowerCase();
    return [event, !OFF_VALUES.has(raw)];
  }));
}

async function diagnoseTeamClaimNotifications(client, { env = process.env, guild = null } = {}) {
  const channelId = String(env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID || '').trim();
  const events = eventSwitches(env);
  const result = { configured: Boolean(channelId), channelId: channelId || null, channelFound: false, textBased: false, inGuild: null, permissions: { viewChannel: null, sendMessages: null, embedLinks: null }, events, status: 'not-configured', advice: [] };
  if (!channelId) {
    result.advice.push('Set TEAM_CLAIM_NOTIFICATION_CHANNEL_ID in .env, then restart the bot.');
    return result;
  }
  let channel;
  try { channel = await client?.channels?.fetch?.(channelId); }
  catch (error) { result.fetchError = error?.code || error?.message || 'fetch-failed'; }
  if (!channel) {
    result.status = 'channel-unavailable';
    result.advice.push('Confirm the channel ID is correct and the bot can access the server and channel.');
    return result;
  }
  result.channelFound = true;
  result.textBased = Boolean(channel.isTextBased?.() && typeof channel.send === 'function');
  result.inGuild = Boolean(channel.guildId || channel.guild);
  if (!result.textBased) {
    result.status = 'not-text-based';
    result.advice.push('Choose a standard Discord text channel that supports sending messages.');
    return result;
  }
  const targetGuild = channel.guild || (guild && (!channel.guildId || channel.guildId === guild.id) ? guild : null);
  const botMember = targetGuild?.members?.me;
  if (botMember && channel.permissionsFor) {
    const perms = channel.permissionsFor(botMember);
    result.permissions = {
      viewChannel: Boolean(perms?.has?.('ViewChannel')),
      sendMessages: Boolean(perms?.has?.('SendMessages')),
      embedLinks: Boolean(perms?.has?.('EmbedLinks'))
    };
  }
  const missing = Object.entries(result.permissions).filter(([, value]) => value === false).map(([key]) => key);
  if (missing.length) {
    result.status = 'missing-permissions';
    result.advice.push(`Grant the bot these channel permissions: ${missing.join(', ')}.`);
  } else if (Object.values(result.permissions).some(value => value === null)) {
    result.status = 'channel-found-permissions-unverified';
    result.advice.push('Channel is reachable, but permission verification was unavailable. Run /teamnotifications test to confirm sending embeds.');
  } else {
    result.status = 'ready';
    result.advice.push('Channel and required permissions look good. Use /teamnotifications test to verify actual delivery.');
  }
  if (!Object.values(events).some(Boolean)) result.advice.push('All team-claim event types are disabled by environment settings.');
  return result;
}

module.exports = { diagnoseTeamClaimNotifications, eventSwitches };
