'use strict';


// Optional team-claim announcements. Disabled unless a text-channel ID is configured.
const fs = require('node:fs');
const path = require('node:path');
const DEFAULT_HEALTH_LIMIT = 50;
const MIN_HEALTH_LIMIT = 10;
const MAX_HEALTH_LIMIT = 500;
const HEALTH_SCHEMA_VERSION = 1;
const DEFAULT_HEALTH_FILE = path.join(__dirname, '..', 'data', 'team-notification-health.json');
const DEFAULT_RETENTION_FILE = path.join(__dirname, '..', 'data', 'team-notification-retention.json');
const health = { totals: { attempted: 0, sent: 0, failed: 0, skipped: 0 }, byEvent: {}, recent: [], incidentActive: false, incidentStartedAt: null };

function healthFilePath() {
  return path.resolve(String(process.env.TEAM_CLAIM_HEALTH_FILE || DEFAULT_HEALTH_FILE));
}

function retentionFilePath() {
  return path.resolve(String(process.env.TEAM_CLAIM_RETENTION_FILE || DEFAULT_RETENTION_FILE));
}

function clampRetention(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_HEALTH_LIMIT;
  return Math.max(MIN_HEALTH_LIMIT, Math.min(MAX_HEALTH_LIMIT, parsed));
}

function loadRetentionLimit() {
  try {
    const saved = JSON.parse(fs.readFileSync(retentionFilePath(), 'utf8'));
    return clampRetention(saved?.limit);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') console.warn('Could not load notification retention settings:', error.message);
    return DEFAULT_HEALTH_LIMIT;
  }
}

let healthLimit = loadRetentionLimit();

function setNotificationRetentionLimit(value) {
  const next = clampRetention(value);
  const target = retentionFilePath();
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ limit: next, updatedAt: new Date().toISOString() }, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw new Error(`Could not save notification retention setting: ${error.message}`);
  }
  healthLimit = next;
  if (health.recent.length > healthLimit) health.recent.length = healthLimit;
  persistHealth();
  return healthLimit;
}

function normalizeHealth(saved) {
  if (!saved || typeof saved !== 'object' || saved.schemaVersion !== HEALTH_SCHEMA_VERSION) return;
  for (const key of ['attempted', 'sent', 'failed', 'skipped']) {
    const value = Number(saved.totals?.[key]);
    health.totals[key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }
  if (saved.byEvent && typeof saved.byEvent === 'object' && !Array.isArray(saved.byEvent)) {
    for (const [event, counts] of Object.entries(saved.byEvent)) {
      if (!counts || typeof counts !== 'object') continue;
      health.byEvent[event] = {};
      for (const key of ['sent', 'failed', 'skipped']) {
        const value = Number(counts[key]);
        health.byEvent[event][key] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
      }
    }
  }
  health.recent = Array.isArray(saved.recent) ? saved.recent.slice(0, healthLimit).filter(item => item && typeof item === 'object' && typeof item.event === 'string' && typeof item.outcome === 'string').map(item => ({ at: String(item.at || ''), event: item.event.slice(0, 80), outcome: item.outcome, reason: item.reason ? String(item.reason).slice(0, 160) : null, code: item.code ? String(item.code).slice(0, 80) : null })) : [];
  health.incidentActive = saved.incidentActive === true;
  health.incidentStartedAt = health.incidentActive && saved.incidentStartedAt ? String(saved.incidentStartedAt) : null;
}

function loadHealth() {
  try { normalizeHealth(JSON.parse(fs.readFileSync(healthFilePath(), 'utf8'))); }
  catch (error) { if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') console.warn('Could not load persisted team-notification health history:', error.message); }
}

function persistHealth() {
  const target = healthFilePath();
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: HEALTH_SCHEMA_VERSION, updatedAt: new Date().toISOString(), totals: health.totals, byEvent: health.byEvent, recent: health.recent.slice(0, healthLimit), incidentActive: health.incidentActive, incidentStartedAt: health.incidentStartedAt }, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    console.warn('Could not persist team-notification health history:', error.message);
  }
}

loadHealth();

function recordHealth(event, outcome, details = {}) {
  health.totals.attempted++;
  if (outcome === 'sent') health.totals.sent++;
  else if (outcome === 'failed') health.totals.failed++;
  else health.totals.skipped++;
  const bucket = health.byEvent[event] || (health.byEvent[event] = { sent: 0, failed: 0, skipped: 0 });
  bucket[outcome] = (bucket[outcome] || 0) + 1;
  health.recent.unshift({ at: new Date().toISOString(), event, outcome, reason: details.reason || null, code: details.code || null });
  if (health.recent.length > healthLimit) health.recent.length = healthLimit;
  persistHealth();
}

function getNotificationHealth() {
  return { totals: { ...health.totals }, byEvent: Object.fromEntries(Object.entries(health.byEvent).map(([key, value]) => [key, { ...value }])), recent: health.recent.map(item => ({ ...item })), incidentActive: health.incidentActive, incidentStartedAt: health.incidentStartedAt, capacity: healthLimit, configured: Boolean(String(process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID || '').trim()) };
}

function resetNotificationHealth() {
  health.totals = { attempted: 0, sent: 0, failed: 0, skipped: 0 };
  health.byEvent = {};
  health.recent = [];
  health.incidentActive = false;
  health.incidentStartedAt = null;
  persistHealth();
}
function notificationEnabled(event, env = process.env) {
  const settingByEvent = {
    team_claimed: 'TEAM_CLAIM_NOTIFY_CLAIMS',
    team_released: 'TEAM_CLAIM_NOTIFY_RELEASES',
    repair_applied: 'TEAM_CLAIM_NOTIFY_REPAIRS'
  };
  const setting = settingByEvent[event];
  if (!setting) return true;
  const value = String(env[setting] ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off', 'disabled'].includes(value);
}

function errorCode(error) {
  return String(error?.code ?? error?.status ?? error?.statusCode ?? 'unknown').slice(0, 80);
}

// Optional out-of-band alerting is deliberately separate from the normal notification
// channel and does not write its own messages into notification telemetry.
let lastAutomaticAlertAt = 0;
async function maybeSendRecoveryNotice(client, event, logger = console) {
  const alertChannelId = String(process.env.TEAM_CLAIM_ALERT_CHANNEL_ID || '').trim();
  if (!alertChannelId || !health.incidentActive) return;
  const startedAt = health.incidentStartedAt;
  // Clear and persist the incident transition before attempting delivery so a later
  // successful event does not flood the channel if the recovery notice itself fails.
  health.incidentActive = false;
  health.incidentStartedAt = null;
  persistHealth();
  try {
    const channel = await client?.channels?.fetch?.(alertChannelId);
    if (!channel || !channel.isTextBased?.() || typeof channel.send !== 'function') {
      logger.warn?.('Notification recovery notice could not reach its configured alert channel.', { alertChannelId });
      return;
    }
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle('BLACKLINE · Notification Delivery Recovered')
      .setDescription('A team-claim notification was delivered successfully after a previously detected failure incident.')
      .addFields({ name: 'Latest successful event', value: String(event || 'unknown').slice(0, 100), inline: true }, { name: 'Incident started', value: startedAt ? `<t:${Math.floor(new Date(startedAt).getTime() / 1000)}:R>` : 'Unknown', inline: true })
      .setFooter({ text: 'Recovery detected from a normal notification send' }).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn?.('Notification recovery notice delivery failed.', { code: errorCode(error), message: String(error?.message || error).slice(0, 160) });
  }
}

async function maybeSendFailureAlert(client, event, code, logger = console) {
  const alertChannelId = String(process.env.TEAM_CLAIM_ALERT_CHANNEL_ID || '').trim();
  if (!alertChannelId) return;
  const configuredThreshold = Number.parseInt(process.env.TEAM_CLAIM_ALERT_FAILURE_THRESHOLD || '3', 10);
  const threshold = Number.isInteger(configuredThreshold) ? Math.max(1, Math.min(10, configuredThreshold)) : 3;
  const recentFailures = health.recent.slice(0, 10).filter(item => item.outcome === 'failed').length;
  const now = Date.now();
  if (recentFailures >= threshold && !health.incidentActive) {
    health.incidentActive = true;
    health.incidentStartedAt = new Date(now).toISOString();
    persistHealth();
  }
  // Cool down alerts for 15 minutes to avoid flooding a staff channel during an outage.
  if (recentFailures < threshold || now - lastAutomaticAlertAt < 15 * 60 * 1000) return;
  lastAutomaticAlertAt = now;
  try {
    const channel = await client?.channels?.fetch?.(alertChannelId);
    if (!channel || !channel.isTextBased?.() || typeof channel.send !== 'function') {
      logger.warn?.('Automatic team-notification alert could not reach its configured alert channel.', { alertChannelId });
      return;
    }
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle('BLACKLINE · Notification Delivery Alert')
      .setDescription(`At least ${recentFailures} notification failures were recorded among the latest 10 retained events.`)
      .addFields({ name: 'Latest event', value: String(event || 'unknown').slice(0, 100), inline: true }, { name: 'Error code', value: String(code || 'unknown').slice(0, 100), inline: true })
      .setFooter({ text: 'Automatic alert • further alerts are rate-limited for 15 minutes' }).setTimestamp();
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn?.('Automatic team-notification alert delivery failed.', { code: errorCode(error), message: String(error?.message || error).slice(0, 160) });
  }
}

function isRetryable(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.httpStatus ?? 0);
  const code = String(error?.code ?? '').toUpperCase();
  return status === 429 || status >= 500 || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(code);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(operation, { attempts = 3, delayMs = 250, logger = console, label = 'notification operation', shouldRetry = isRetryable } = {}) {
  const totalAttempts = Math.max(1, Math.min(4, Number(attempts) || 1));
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const retry = attempt < totalAttempts && shouldRetry(error);
      logger.warn?.('Team-claim notification delivery attempt failed.', {
        operation: label,
        attempt,
        maxAttempts: totalAttempts,
        code: errorCode(error),
        retrying: retry
      });
      if (!retry) throw error;
      const retryAfter = Number(error?.retry_after ?? error?.data?.retry_after ?? 0);
      const waitMs = retryAfter > 0 ? Math.min(5000, retryAfter * (retryAfter < 100 ? 1000 : 1)) : delayMs * attempt;
      await wait(waitMs);
    }
  }
}

async function notifyTeamClaimChange(client, dynasty, event, details = {}, logger = console) {
  if (!notificationEnabled(event)) { recordHealth(event, 'skipped', { reason: 'event-disabled' }); return { sent: false, reason: 'event-disabled' }; }
  const channelId = String(process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID || '').trim();
  if (!channelId) { recordHealth(event, 'skipped', { reason: 'not-configured' }); return { sent: false, reason: 'not-configured' }; }
  try {
    const channel = await withRetry(() => client?.channels?.fetch?.(channelId), { logger, label: 'channel-fetch' });
    if (!channel || !channel.isTextBased?.() || typeof channel.send !== 'function') {
      logger.warn?.('Team-claim notification skipped: configured channel is unavailable or not text-based.', { channelId });
      recordHealth(event, 'failed', { reason: 'channel-unavailable' });
      return { sent: false, reason: 'channel-unavailable' };
    }
    const eventMeta = {
      team_claimed: { title: 'Team Claimed', color: 0x2ecc71, description: 'A coach has selected a team.' },
      team_released: { title: 'Team Released', color: 0xe67e22, description: 'A team has been made available again.' },
      repair_applied: { title: 'Team Claim Repair Applied', color: 0x5865f2, description: 'A manager applied team-claim consistency repairs.' }
    };
    const meta = eventMeta[event] || { title: 'Team Claim Update', color: 0x95a5a6, description: 'A team-selection update occurred.' };
    const safeText = (value, max = 1024) => String(value ?? '').replace(/@/g, '@\u200b').slice(0, max);
    const embed = {
      title: meta.title,
      description: meta.description,
      color: meta.color,
      fields: [{ name: 'Dynasty', value: safeText(dynasty?.name || 'Dynasty', 256) || 'Dynasty', inline: true }],
      timestamp: new Date().toISOString(),
      footer: { text: 'BLACKLINE • Team Selection' }
    };
    if (details.team) embed.fields.push({ name: 'Team', value: safeText(details.team, 256) || 'Unknown', inline: true });
    if (details.username) embed.fields.push({ name: 'Coach', value: safeText(details.username, 256) || 'Unknown', inline: true });
    if (details.actorName) embed.fields.push({ name: 'Action by', value: safeText(details.actorName, 256) || 'Unknown', inline: true });
    if (details.summary) embed.fields.push({ name: 'Repair summary', value: safeText(details.summary, 1024) || 'No details provided', inline: false });
    // Only retry an explicit Discord rate-limit response. Retrying ambiguous network
    // failures after POST could create duplicate announcements if Discord accepted the first send.
    await withRetry(() => channel.send({ embeds: [embed], allowedMentions: { parse: [] } }), {
      logger, label: 'message-send', attempts: 3,
      delayMs: 250, shouldRetry: error => Number(error?.status ?? error?.statusCode ?? 0) === 429
    }).catch(error => { throw error; });
    recordHealth(event, 'sent');
    await maybeSendRecoveryNotice(client, event, logger);
    return { sent: true };
  } catch (error) {
    logger.error?.('Team-claim notification failed; the underlying team action remains saved.', {
      event,
      channelId,
      code: errorCode(error),
      message: String(error?.message || error).slice(0, 200)
    });
    const code = errorCode(error);
    recordHealth(event, 'failed', { reason: 'send-failed', code });
    await maybeSendFailureAlert(client, event, code, logger);
    return code === 'unknown' ? { sent: false, reason: 'send-failed' } : { sent: false, reason: 'send-failed', code };
  }
}

module.exports = { notifyTeamClaimChange, notificationEnabled, withRetry, isRetryable, getNotificationHealth, resetNotificationHealth, setNotificationRetentionLimit, MIN_HEALTH_LIMIT, MAX_HEALTH_LIMIT, DEFAULT_HEALTH_LIMIT };
