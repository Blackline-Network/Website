'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { channelList, normalizeStream } = require('../stream-monitor');
test('channelList normalizes handles, removes duplicates and rejects malformed names', () => {
  assert.deepEqual(channelList(' @Alpha,alpha,valid_name, bad/name, ,BETA '), ['alpha', 'valid_name', 'beta']);
});
test('channelList caps tracked Twitch channels at 100', () => {
  const channels = Array.from({ length: 110 }, (_, i) => `channel${i}`).join(',');
  assert.equal(channelList(channels).length, 100);
});
test('normalizeStream produces safe Twitch watch URLs and bounds title length', () => {
  const stream = normalizeStream({ user_login: 'Example_User', title: 'x'.repeat(200) });
  assert.equal(stream.channel, 'example_user');
  assert.equal(stream.url, 'https://www.twitch.tv/example_user');
  assert.equal(stream.title.length, 160);
  assert.equal(normalizeStream({ user_login: '../bad' }), null);
});
