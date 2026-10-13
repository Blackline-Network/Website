'use strict';
// Twitch Helix poller -> BLACKLINE's authenticated stream-status endpoint.
// Configure TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_CHANNELS and
// STREAM_STATUS_WEBHOOK_SECRET in the project-root .env. Keep this process running.
const { URLSearchParams } = require('node:url');

function channelList(value = '') {
  return [...new Set(String(value).split(',').map(x => x.trim().replace(/^@/, '').toLowerCase()).filter(x => /^[a-z0-9_]{1,25}$/.test(x)))].slice(0, 100);
}
function normalizeStream(stream) {
  const channel = String(stream.user_login || '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(channel)) return null;
  return { platform: 'twitch', channel, live: true, title: String(stream.title || 'Live now').slice(0, 160), url: `https://www.twitch.tv/${channel}` };
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${String(body.message || body.error || 'request failed').slice(0, 200)}`);
  return body;
}
async function runOnce(env = process.env) {
  const clientId = String(env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(env.TWITCH_CLIENT_SECRET || '').trim();
  const secret = String(env.STREAM_STATUS_WEBHOOK_SECRET || '').trim();
  const endpoint = String(env.BLACKLINE_STREAM_STATUS_ENDPOINT || 'http://127.0.0.1:3030/api/stream-status').trim();
  const channels = channelList(env.TWITCH_CHANNELS);
  if (!clientId || !clientSecret || !secret || !channels.length) throw new Error('Configure TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, STREAM_STATUS_WEBHOOK_SECRET, and TWITCH_CHANNELS in the project-root .env.');
  const endpointUrl = new URL(endpoint);
  if (endpointUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(endpointUrl.hostname)) throw new Error('The stream status endpoint must use HTTPS unless it is localhost.');
  const tokenBody = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
  const token = await requestJson('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody });
  if (!token.access_token) throw new Error('Twitch did not return an app access token.');
  const live = new Map();
  for (let i = 0; i < channels.length; i += 100) {
    const params = new URLSearchParams();
    channels.slice(i, i + 100).forEach(login => params.append('user_login', login));
    const result = await requestJson(`https://api.twitch.tv/helix/streams?${params}`, { headers: { 'Client-ID': clientId, Authorization: `Bearer ${token.access_token}` } });
    for (const item of Array.isArray(result.data) ? result.data : []) { const normalized = normalizeStream(item); if (normalized) live.set(normalized.channel, normalized); }
  }
  let sent = 0;
  for (const channel of channels) {
    const stream = live.get(channel) || { platform: 'twitch', channel, live: false };
    await requestJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` }, body: JSON.stringify(stream) });
    sent++;
  }
  return { tracked: channels.length, live: live.size, updatesSent: sent };
}
async function main() {
  const intervalMs = Math.max(60000, Math.min(15 * 60 * 1000, Number(process.env.TWITCH_POLL_INTERVAL_MS || 120000)));
  console.log(`[stream-monitor] Twitch polling enabled; interval ${Math.round(intervalMs / 1000)}s.`);
  let busy = false;
  const poll = async () => { if (busy) return; busy = true; try { const result = await runOnce(); console.log(`[stream-monitor] ${result.live}/${result.tracked} live; ${result.updatesSent} status updates sent.`); } catch (error) { console.error(`[stream-monitor] ${error.message}`); } finally { busy = false; } };
  await poll();
  setInterval(poll, intervalMs);
}
if (require.main === module) main().catch(error => { console.error(`[stream-monitor] ${error.message}`); process.exitCode = 1; });
module.exports = { channelList, normalizeStream, runOnce };
