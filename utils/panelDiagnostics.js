'use strict';

const PANEL_TARGETS = Object.freeze({
  'Schedule / readiness': ['scheduleChannelId', 'scheduleMessageId'],
  'Competition Center': ['competitionChannelId', 'competitionMessageId'],
  'League History': ['historyChannelId', 'historyMessageId'],
  'Coach Center': ['coachCenterChannelId', 'coachCenterMessageId'],
  'Team Selection': ['teamChannelId', 'teamMessageId'],
  'League Hub dashboard': ['dashboardChannelId', 'dashboardMessageId']
});

function explainDiscordFetchError(error, resource) {
  const code = Number(error?.code ?? error?.rawError?.code);
  if (code === 10003) return `Discord reports that the saved ${resource} no longer exists (Unknown Channel).`;
  if (code === 10008) return 'Discord reports that the saved panel message no longer exists (Unknown Message).';
  if (code === 50001) return `Discord denied access to the saved ${resource} (Missing Access). Check bot membership and channel visibility.`;
  if (code === 50013) return `Discord denied the required action on the saved ${resource} (Missing Permissions). Review channel overrides.`;
  if (code === 500) return `Discord returned an internal API error while fetching the saved ${resource}. Retry later and inspect the bot log if it persists.`;
  return null;
}

async function diagnosePanelFailure(client, dynasty, label) {
  const keys = PANEL_TARGETS[label];
  if (!keys) return 'The refresh operation returned no success result; inspect the bot log for details.';
  const [channelKey, messageKey] = keys;
  const savedChannelId = dynasty?.[channelKey];
  const savedMessageId = dynasty?.[messageKey];
  if (!dynasty?.guildId) return 'This dynasty has no saved Discord server ID. Run the existing panel setup workflow in the correct server.';
  let guildError = null;
  const guild = await client.guilds.fetch(dynasty.guildId).catch(error => { guildError = error; return null; });
  if (!guild) return explainDiscordFetchError(guildError, `Discord server ${dynasty.guildId}`)
    || `The saved Discord server (${dynasty.guildId}) could not be fetched. Check that the bot is still in that server and inspect the bot log for the API error.`;
  let channelError = null;
  let channel = savedChannelId ? await client.channels.fetch(savedChannelId).catch(error => { channelError = error; return null; }) : null;
  if (channel && channel.guild?.id !== guild.id) channel = null;
  if (!channel) return savedChannelId
    ? (explainDiscordFetchError(channelError, `channel ${savedChannelId}`) || `Saved channel ${savedChannelId} is missing, inaccessible, or belongs to another server. Run the existing panel setup workflow to repair this panel.`)
    : 'No channel ID is saved for this panel. Run the existing panel setup workflow to create or attach it.';
  if (typeof channel.isTextBased !== 'function' || !channel.isTextBased()) return `Saved channel ${savedChannelId} is not a text-based channel.`;
  const permissions = channel.permissionsFor?.(guild.members?.me || client.user);
  if (permissions) {
    const required = [
      ['View Channel', 'ViewChannel'],
      ['Read Message History', 'ReadMessageHistory'],
      ['Send Messages', 'SendMessages'],
      ['Embed Links', 'EmbedLinks']
    ];
    const missing = required.filter(([, bit]) => !permissions.has(bit)).map(([name]) => name);
    if (missing.length) return `Bot is missing channel permissions: ${missing.join(', ')}.`;
  }
  if (savedMessageId) {
    let messageError = null;
    const message = await channel.messages?.fetch(savedMessageId).catch(error => { messageError = error; return null; });
    if (!message) return explainDiscordFetchError(messageError, `panel message ${savedMessageId}`)
      || `Saved panel message ${savedMessageId} could not be fetched. It may have been deleted or the bot may lack Read Message History access; use the existing setup workflow only if recovery cannot find it.`;
  }
  return 'The saved channel and message references appear reachable, but the panel renderer returned no success result. Check the bot log for the underlying Discord API error and verify channel permissions.';
}

module.exports = { PANEL_TARGETS, diagnosePanelFailure, explainDiscordFetchError };
