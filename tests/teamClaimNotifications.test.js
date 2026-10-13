'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyTeamClaimChange } = require('../utils/teamClaimNotifications');

test('notifications are disabled by default when no channel is configured', async () => {
  const old = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
  try { assert.deepEqual(await notifyTeamClaimChange({}, { name: 'Test' }, 'team_claimed'), { sent: false, reason: 'not-configured' }); }
  finally { if (old !== undefined) process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = old; }
});

test('sends a safe notification to configured text channel without mentions', async () => {
  const old = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = '123';
  let payload; const channel = { isTextBased: () => true, send: async p => { payload = p; } };
  try {
    const result = await notifyTeamClaimChange({ channels: { fetch: async id => id === '123' ? channel : null } }, { name: 'Dynasty' }, 'team_claimed', { team: 'Alpha', username: '@everyone' }, { warn() {} });
    assert.deepEqual(result, { sent: true }); assert.equal(payload.embeds.length, 1); assert.equal(payload.embeds[0].title, 'Team Claimed'); assert.equal(payload.embeds[0].fields.find(f => f.name === 'Coach').value, '@\u200beveryone'); assert.deepEqual(payload.allowedMentions, { parse: [] });
  } finally { if (old !== undefined) process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = old; else delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; }
});

test('notification failures are swallowed so saved team actions are not interrupted', async () => {
  const old = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = '123';
  try { const result = await notifyTeamClaimChange({ channels: { fetch: async () => { throw new Error('offline'); } } }, { name: 'Dynasty' }, 'team_released', {}, { warn() {} }); assert.deepEqual(result, { sent: false, reason: 'send-failed' }); }
  finally { if (old !== undefined) process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = old; else delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; }
});


test('event-specific notification switches default to enabled and can be disabled', async () => {
  const { notificationEnabled } = require('../utils/teamClaimNotifications');
  assert.equal(notificationEnabled('team_claimed', {}), true);
  assert.equal(notificationEnabled('team_released', { TEAM_CLAIM_NOTIFY_RELEASES: 'false' }), false);
  assert.equal(notificationEnabled('repair_applied', { TEAM_CLAIM_NOTIFY_REPAIRS: '0' }), false);
  assert.equal(notificationEnabled('team_claimed', { TEAM_CLAIM_NOTIFY_CLAIMS: 'off' }), false);
  assert.equal(notificationEnabled('unknown_event', {}), true);
});

test('disabled event skips channel fetch and send', async () => {
  const oldChannel = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
  const oldToggle = process.env.TEAM_CLAIM_NOTIFY_CLAIMS;
  process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = '123';
  process.env.TEAM_CLAIM_NOTIFY_CLAIMS = 'false';
  let fetched = false;
  try {
    const result = await notifyTeamClaimChange({ channels: { fetch: async () => { fetched = true; return null; } } }, { name: 'Dynasty' }, 'team_claimed');
    assert.deepEqual(result, { sent: false, reason: 'event-disabled' });
    assert.equal(fetched, false);
  } finally {
    if (oldChannel === undefined) delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; else process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = oldChannel;
    if (oldToggle === undefined) delete process.env.TEAM_CLAIM_NOTIFY_CLAIMS; else process.env.TEAM_CLAIM_NOTIFY_CLAIMS = oldToggle;
  }
});


test('transient channel fetch errors are retried and logged', async () => {
  const { withRetry } = require('../utils/teamClaimNotifications');
  let calls = 0; const warnings = [];
  const result = await withRetry(async () => {
    calls++;
    if (calls === 1) { const e = new Error('temporarily unavailable'); e.status = 503; throw e; }
    return 'ok';
  }, { attempts: 2, delayMs: 1, logger: { warn: (...args) => warnings.push(args) }, label: 'test-fetch' });
  assert.equal(result, 'ok'); assert.equal(calls, 2); assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1].retrying, true);
});

test('permanent client errors are not retried', async () => {
  const { withRetry } = require('../utils/teamClaimNotifications');
  let calls = 0;
  await assert.rejects(() => withRetry(async () => { calls++; const e = new Error('forbidden'); e.status = 403; throw e; }, { attempts: 3, delayMs: 1, logger: { warn() {} } }));
  assert.equal(calls, 1);
});

test('notification failure logs event and code while preserving non-throwing result', async () => {
  const old = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = '123';
  const logs = [];
  try {
    const result = await notifyTeamClaimChange({ channels: { fetch: async () => { const e = new Error('forbidden'); e.status = 403; throw e; } } }, { name: 'Dynasty' }, 'team_released', {}, { warn() {}, error: (...args) => logs.push(args) });
    assert.equal(result.sent, false); assert.equal(result.reason, 'send-failed'); assert.equal(result.code, '403');
    assert.equal(logs.length, 1); assert.equal(logs[0][1].event, 'team_released');
  } finally { if (old !== undefined) process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = old; else delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; }
});

test('notification health tracks sent, failed, and skipped events with bounded recent history', async () => {
  const { getNotificationHealth, resetNotificationHealth, notifyTeamClaimChange } = require('../utils/teamClaimNotifications');
  const oldChannel = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
  const oldToggle = process.env.TEAM_CLAIM_NOTIFY_CLAIMS;
  resetNotificationHealth();
  try {
    delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
    await notifyTeamClaimChange({}, { name: 'Test' }, 'team_claimed');
    process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = '123';
    process.env.TEAM_CLAIM_NOTIFY_CLAIMS = 'false';
    await notifyTeamClaimChange({}, { name: 'Test' }, 'team_claimed');
    process.env.TEAM_CLAIM_NOTIFY_CLAIMS = 'true';
    const channel = { isTextBased: () => true, send: async () => {} };
    await notifyTeamClaimChange({ channels: { fetch: async () => channel } }, { name: 'Test' }, 'team_released', {}, { warn() {}, error() {} });
    const health = getNotificationHealth();
    assert.equal(health.totals.attempted, 3);
    assert.equal(health.totals.skipped, 2);
    assert.equal(health.totals.sent, 1);
    assert.equal(health.totals.failed, 0);
    assert.equal(health.recent.length, 3);
    assert.equal(health.recent[0].outcome, 'sent');
    assert.equal(health.configured, true);
  } finally {
    resetNotificationHealth();
    if (oldChannel === undefined) delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; else process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = oldChannel;
    if (oldToggle === undefined) delete process.env.TEAM_CLAIM_NOTIFY_CLAIMS; else process.env.TEAM_CLAIM_NOTIFY_CLAIMS = oldToggle;
  }
});

test('notification health records delivery failure codes', async () => {
  const { getNotificationHealth, resetNotificationHealth, notifyTeamClaimChange } = require('../utils/teamClaimNotifications');
  const oldChannel = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
  resetNotificationHealth(); process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = '123';
  try {
    await notifyTeamClaimChange({ channels: { fetch: async () => { const e = new Error('forbidden'); e.status = 403; throw e; } } }, { name: 'Test' }, 'team_released', {}, { warn() {}, error() {} });
    const health = getNotificationHealth();
    assert.equal(health.totals.failed, 1);
    assert.equal(health.recent[0].code, '403');
  } finally {
    resetNotificationHealth();
    if (oldChannel === undefined) delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; else process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = oldChannel;
  }
});


test('notification health history persists to a local JSON file', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { getNotificationHealth, resetNotificationHealth, notifyTeamClaimChange } = require('../utils/teamClaimNotifications');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blackline-health-'));
  const file = path.join(directory, 'health.json');
  const oldFile = process.env.TEAM_CLAIM_HEALTH_FILE;
  const oldChannel = process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
  process.env.TEAM_CLAIM_HEALTH_FILE = file;
  delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID;
  try {
    resetNotificationHealth();
    await notifyTeamClaimChange({}, { name: 'Persistent Test' }, 'team_claimed');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.totals.attempted, 1);
    assert.equal(saved.totals.skipped, 1);
    assert.equal(saved.recent[0].reason, 'not-configured');
    assert.equal(getNotificationHealth().totals.attempted, 1);
  } finally {
    resetNotificationHealth();
    if (oldFile === undefined) delete process.env.TEAM_CLAIM_HEALTH_FILE; else process.env.TEAM_CLAIM_HEALTH_FILE = oldFile;
    if (oldChannel === undefined) delete process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID; else process.env.TEAM_CLAIM_NOTIFICATION_CHANNEL_ID = oldChannel;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
