const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCreatorConnectionsPanel, PANEL_TITLE, DEFAULT_CHANNEL_NAME } = require('../utils/creatorConnectionsPanel');

test('Creator Connections panel targets the requested media channel by default', () => {
  assert.equal(DEFAULT_CHANNEL_NAME, '🎥・media');
});

test('Creator Connections panel has a safe absolute website link and management copy', () => {
  const payload = buildCreatorConnectionsPanel('https://blackline.example/');
  assert.equal(payload.embeds[0].data.title, PANEL_TITLE);
  assert.match(payload.embeds[0].data.description, /Connect Twitch/);
  assert.match(payload.embeds[0].data.description, /Disconnect/);
  assert.equal(payload.components[0].components[0].data.url, 'https://blackline.example/creator-connections.html');
});

test('Creator Connections panel rejects missing or non-http website URL', () => {
  assert.throws(() => buildCreatorConnectionsPanel(''), /absolute http\(s\) URL/);
  assert.throws(() => buildCreatorConnectionsPanel('javascript:alert(1)'), /absolute http\(s\) URL/);
});
