'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnosePanelFailure, PANEL_TARGETS, explainDiscordFetchError } = require('../utils/panelDiagnostics');

test('panel diagnostics map every refresh label to its saved reference keys', () => {
  assert.deepEqual(PANEL_TARGETS['Competition Center'], ['competitionChannelId', 'competitionMessageId']);
  assert.deepEqual(PANEL_TARGETS['Schedule / readiness'], ['scheduleChannelId', 'scheduleMessageId']);
  assert.ok(PANEL_TARGETS['League Hub dashboard']);
});

test('panel diagnostics explain missing guild configuration without Discord calls', async () => {
  const result = await diagnosePanelFailure({ guilds: { fetch: async () => null } }, {}, 'Competition Center');
  assert.match(result, /no saved Discord server ID/i);
});

test('panel diagnostics explain inaccessible saved guilds', async () => {
  const result = await diagnosePanelFailure({ guilds: { fetch: async () => { throw new Error('not found'); } } }, { guildId: 'g1' }, 'Competition Center');
  assert.match(result, /could not be fetched/i);
});

test('unknown panel labels return a safe fallback diagnostic', async () => {
  const result = await diagnosePanelFailure({}, {}, 'Unknown Panel');
  assert.match(result, /inspect the bot log/i);
});


test('panel diagnostics distinguish deleted messages from permission failures', () => {
  assert.match(explainDiscordFetchError({ code: 10008 }, 'message'), /Unknown Message/i);
  assert.match(explainDiscordFetchError({ code: 50013 }, 'channel'), /Missing Permissions/i);
  assert.equal(explainDiscordFetchError(new Error('network timeout'), 'channel'), null);
});

test('panel diagnostics preserve Discord API error codes for deleted messages', async () => {
  const client = {
    guilds: { fetch: async () => ({ id: 'g1', members: { me: {} } }) },
    channels: { fetch: async () => ({ id: 'c1', guild: { id: 'g1' }, isTextBased: () => true, permissionsFor: () => ({ has: () => true }), messages: { fetch: async () => { throw Object.assign(new Error('Unknown Message'), { code: 10008 }); } } }) }
  };
  const result = await diagnosePanelFailure(client, { guildId: 'g1', competitionChannelId: 'c1', competitionMessageId: 'm1' }, 'Competition Center');
  assert.match(result, /Unknown Message/i);
});
