const test = require('node:test');
const assert = require('node:assert/strict');
const { EVENT_TYPES, ensureNotificationSettings, isNotificationEnabled, buildNotificationEmbed, publishLeagueNotification } = require('../utils/leagueNotifications');

test('notification settings initialize without enabling unconfigured announcements', () => {
  const dynasty = { name: 'Test League', season: 2 };
  ensureNotificationSettings(dynasty);
  assert.deepEqual(dynasty.notifications.events, {});
  assert.equal(isNotificationEnabled(dynasty, 'score'), false);
});

test('configured channel enables known event types unless explicitly disabled', () => {
  const dynasty = { notifications: { channelId: '123', events: { score: false } } };
  assert.equal(isNotificationEnabled(dynasty, 'score'), false);
  assert.equal(isNotificationEnabled(dynasty, 'champion'), true);
  assert.equal(isNotificationEnabled(dynasty, 'unknown'), false);
});

test('event labels cover supported notification categories', () => {
  assert.deepEqual(Object.keys(EVENT_TYPES), ['score', 'correction', 'playoff', 'champion', 'offseason', 'award', 'signing']);
});

test('announcement embed limits user-controlled text and includes season context', () => {
  const embed = buildNotificationEmbed({ name: 'Test League', season: 4 }, { title: 'A'.repeat(300), description: 'B'.repeat(5000) });
  assert.equal(embed.title.length, 256);
  assert.equal(embed.description.length, 4000);
  assert.match(embed.footer.text, /Season 4/);
});

test('publishing does not send when notifications are not configured', async () => {
  let fetchCount = 0;
  const result = await publishLeagueNotification({ channels: { fetch: async () => { fetchCount++; } } }, {}, { name: 'Test', season: 1 }, { type: 'score', key: 's1-w1-game1' });
  assert.equal(result.sent, false);
  assert.equal(fetchCount, 0);
});

test('duplicate event keys are not sent twice', async () => {
  let fetchCount = 0;
  const dynasty = { name: 'Test', season: 1, notifications: { channelId: '123' }, notificationLog: [{ key: 's1-game1-score' }] };
  const result = await publishLeagueNotification({ channels: { fetch: async () => { fetchCount++; } } }, {}, dynasty, { type: 'score', key: 's1-game1-score' });
  assert.equal(result.reason, 'duplicate');
  assert.equal(fetchCount, 0);
});

test('successful event posts persist a deduplication marker', async () => {
  const sent = [];
  const dynasty = { name: 'Test', season: 1, notifications: { channelId: '123' }, notificationLog: [] };
  const client = { channels: { fetch: async () => ({ isTextBased: () => true, send: async payload => sent.push(payload) }) } };
  const result = await publishLeagueNotification(client, null, dynasty, { type: 'score', key: 's1-game1-score', title: 'Final score', description: 'A 21–7 B' });
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  assert.equal(dynasty.notificationLog[0].key, 's1-game1-score');
});
