'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnoseTeamClaimNotifications, eventSwitches } = require('../utils/teamClaimNotificationDiagnostics');

test('diagnostics explain missing channel configuration without fetching', async () => {
  let fetched = false;
  const result = await diagnoseTeamClaimNotifications({ channels: { fetch: async () => { fetched = true; } } }, { env: {} });
  assert.equal(result.status, 'not-configured');
  assert.equal(fetched, false);
  assert.match(result.advice[0], /TEAM_CLAIM_NOTIFICATION_CHANNEL_ID/);
});

test('diagnostics detect an unavailable channel', async () => {
  const result = await diagnoseTeamClaimNotifications({ channels: { fetch: async () => null } }, { env: { TEAM_CLAIM_NOTIFICATION_CHANNEL_ID: '123' } });
  assert.equal(result.status, 'channel-unavailable');
  assert.equal(result.channelFound, false);
});

test('diagnostics identify missing send and embed permissions', async () => {
  const channel = { guildId: 'g', isTextBased: () => true, send: async () => {}, permissionsFor: () => ({ has: permission => permission === 'ViewChannel' }) };
  const guild = { id: 'g', members: { me: { id: 'bot' } } };
  const result = await diagnoseTeamClaimNotifications({ channels: { fetch: async () => channel } }, { env: { TEAM_CLAIM_NOTIFICATION_CHANNEL_ID: '123' }, guild });
  assert.equal(result.status, 'missing-permissions');
  assert.deepEqual(result.permissions, { viewChannel: true, sendMessages: false, embedLinks: false });
});

test('diagnostics report ready when all required permissions are present', async () => {
  const channel = { guildId: 'g', isTextBased: () => true, send: async () => {}, permissionsFor: () => ({ has: () => true }) };
  const result = await diagnoseTeamClaimNotifications({ channels: { fetch: async () => channel } }, { env: { TEAM_CLAIM_NOTIFICATION_CHANNEL_ID: '123' }, guild: { id: 'g', members: { me: {} } } });
  assert.equal(result.status, 'ready');
});

test('event switches are reported independently', () => {
  assert.deepEqual(eventSwitches({ TEAM_CLAIM_NOTIFY_CLAIMS: 'off', TEAM_CLAIM_NOTIFY_RELEASES: 'true', TEAM_CLAIM_NOTIFY_REPAIRS: '0' }), { claims: false, releases: true, repairs: false });
});
