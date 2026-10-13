'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverPanelTarget } = require('../utils/panelRecovery');
const Module = require('node:module');

function makeMessage(id, authorId, title) {
  return {
    id,
    author: { id: authorId },
    embeds: [{ title }],
    edit: async () => true
  };
}

function makeCollection(map) {
  return { find: predicate => [...map.values()].find(predicate), values: () => map.values(), [Symbol.iterator]: () => map[Symbol.iterator]() };
}

function makeChannel({ id, guild, name, messages }) {
  return {
    id, guild, name, parentId: 'category',
    isTextBased: () => true,
    messages: {
      fetch: async argument => {
        if (typeof argument === 'string') return messages.get(argument) || null;
        return makeCollection(messages);
      }
    }
  };
}

test('panel recovery finds an existing panel in its canonical channel when saved IDs are stale', async () => {
  const originalModuleLoad = Module._load;
  const db = { dynasties: [{ name: 'Alpha', guildId: 'guild-1' }] };
  let saved = false;
  Module._load = function(request, parent, isMain) {
    if (request === './league' && parent?.filename?.split(/[\\/]/).slice(-2).join('/') === 'utils/panelRecovery.js') return { loadDatabase: () => db, saveDatabase: () => { saved = true; } };
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  try {
    const message = makeMessage('message-1', 'bot-1', '🏟️ Alpha · Coach Center');
    const messages = new Map([[message.id, message]]);
    const guild = {
      id: 'guild-1',
      channels: {
        cache: new Map(),
        fetch: async () => new Map([['channel-1', channel]])
      }
    };
    const channel = makeChannel({ id: 'channel-1', guild, name: '🏟️・coach-center', messages });
    const client = {
      user: { id: 'bot-1' },
      channels: { fetch: async () => null },
      guilds: { fetch: async () => guild }
    };
    const dynasty = { name: 'Alpha', guildId: 'guild-1', categoryId: 'category', coachCenterChannelId: 'deleted-channel', coachCenterMessageId: 'deleted-message' };
    const result = await recoverPanelTarget(client, dynasty, {
      channelKey: 'coachCenterChannelId', messageKey: 'coachCenterMessageId',
      channelNames: ['🏟️・coach-center'],
      matchesMessage: candidate => candidate.embeds?.some(embed => embed.title === '🏟️ Alpha · Coach Center')
    });
    assert.equal(result.channel.id, 'channel-1');
    assert.equal(result.message.id, 'message-1');
    assert.equal(result.recovered, true);
    assert.equal(dynasty.coachCenterChannelId, 'channel-1');
    assert.equal(dynasty.coachCenterMessageId, 'message-1');
    assert.equal(saved, true);
  } finally {
    Module._load = originalModuleLoad;
  }
});

test('panel recovery rejects a saved channel from the wrong Discord server', async () => {
  const wrongGuild = { id: 'guild-other' };
  const wrongMessage = makeMessage('message-other', 'bot-1', '🏟️ Alpha · Coach Center');
  const channel = makeChannel({ id: 'channel-other', guild: wrongGuild, name: '🏟️・coach-center', messages: new Map([[wrongMessage.id, wrongMessage]]) });
  const guild = { id: 'guild-1', channels: { cache: new Map(), fetch: async () => new Map() } };
  const client = {
    user: { id: 'bot-1' },
    channels: { fetch: async () => channel },
    guilds: { fetch: async () => guild }
  };
  const result = await recoverPanelTarget(client, { name: 'Alpha', guildId: 'guild-1', coachCenterChannelId: 'channel-other', coachCenterMessageId: 'message-other' }, {
    channelKey: 'coachCenterChannelId', messageKey: 'coachCenterMessageId',
    channelNames: ['🏟️・coach-center'],
    matchesMessage: candidate => candidate.embeds?.some(embed => embed.title === '🏟️ Alpha · Coach Center')
  });
  assert.equal(result.channel, null);
  assert.equal(result.message, null);
  assert.equal(result.reason, 'channel-unavailable');
});

test('panel recovery does not create a duplicate when the existing panel cannot be found', async () => {
  const channel = makeChannel({ id: 'channel-1', guild: { id: 'guild-1' }, name: '🏟️・coach-center', messages: new Map() });
  const guild = { id: 'guild-1', channels: { cache: new Map([['channel-1', channel]]), fetch: async () => new Map([['channel-1', channel]]) } };
  const client = { user: { id: 'bot-1' }, channels: { fetch: async () => channel }, guilds: { fetch: async () => guild } };
  const result = await recoverPanelTarget(client, { name: 'Alpha', guildId: 'guild-1', coachCenterChannelId: 'channel-1', coachCenterMessageId: 'missing' }, {
    channelKey: 'coachCenterChannelId', messageKey: 'coachCenterMessageId',
    channelNames: ['🏟️・coach-center'],
    matchesMessage: candidate => candidate.embeds?.some(embed => embed.title === '🏟️ Alpha · Coach Center')
  });
  assert.equal(result.channel.id, 'channel-1');
  assert.equal(result.message, null);
  assert.equal(result.reason, 'message-unavailable');
});
