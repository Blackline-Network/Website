const EVENT_TYPES = Object.freeze({
  score: 'Final scores',
  correction: 'Score corrections',
  playoff: 'Playoff results',
  champion: 'Championships',
  offseason: 'Offseason transitions',
  award: 'Awards and honors',
  signing: 'Recruiting signings'
});

function ensureNotificationSettings(dynasty) {
  if (!dynasty.notifications || typeof dynasty.notifications !== 'object') dynasty.notifications = {};
  if (!dynasty.notifications.events || typeof dynasty.notifications.events !== 'object') dynasty.notifications.events = {};
  if (!Array.isArray(dynasty.notificationLog)) dynasty.notificationLog = [];
  return dynasty.notifications;
}

function isNotificationEnabled(dynasty, type) {
  const settings = ensureNotificationSettings(dynasty);
  return Boolean(settings.channelId) && Object.prototype.hasOwnProperty.call(EVENT_TYPES, type) && settings.events[type] !== false;
}

function buildNotificationEmbed(dynasty, event) {
  return {
    color: 0x243447,
    title: String(event.title || `BLACKLINE · ${dynasty.name}`).slice(0, 256),
    description: String(event.description || '').slice(0, 4000),
    footer: { text: `${dynasty.name} · Season ${dynasty.season} · BLACKLINE League Updates` },
    timestamp: new Date().toISOString()
  };
}

async function publishLeagueNotification(client, database, dynasty, event) {
  const settings = ensureNotificationSettings(dynasty);
  if (!isNotificationEnabled(dynasty, event.type)) return { sent: false, reason: 'disabled-or-unconfigured' };
  const key = String(event.key || '').trim();
  if (!key) return { sent: false, reason: 'missing-key' };
  if (dynasty.notificationLog.some(entry => entry.key === key)) return { sent: false, reason: 'duplicate' };

  let channel;
  try {
    channel = await client.channels.fetch(settings.channelId);
    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') return { sent: false, reason: 'channel-unavailable' };
    await channel.send({ embeds: [buildNotificationEmbed(dynasty, event)], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`BLACKLINE notification failed for ${dynasty.name} (${event.type}):`, error.message);
    return { sent: false, reason: 'send-failed' };
  }

  dynasty.notificationLog.push({ key, type: event.type, sentAt: new Date().toISOString() });
  dynasty.notificationLog = dynasty.notificationLog.slice(-200);
  if (database) require('./league').saveDatabase(database);
  return { sent: true };
}

module.exports = { EVENT_TYPES, ensureNotificationSettings, isNotificationEnabled, buildNotificationEmbed, publishLeagueNotification };
