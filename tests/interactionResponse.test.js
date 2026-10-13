'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { respondToInteraction } = require('../utils/interactionResponse');

test('responds with initial reply when interaction is unacknowledged', async () => {
  const calls = [];
  const result = await respondToInteraction({ reply: async p => calls.push(['reply', p]) }, { content: 'hello' });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'reply');
  assert.equal(calls.length, 1);
});
test('edits deferred interaction instead of attempting a second initial reply', async () => {
  const calls = [];
  const result = await respondToInteraction({ deferred: true, editReply: async p => calls.push(['edit', p]), reply: async () => calls.push(['reply']) }, { content: 'done' });
  assert.equal(result.method, 'editReply');
  assert.deepEqual(calls.map(c => c[0]), ['edit']);
});
test('edits an already-replied interaction', async () => {
  let edited = false;
  const result = await respondToInteraction({ replied: true, editReply: async () => { edited = true; } }, { content: 'updated' });
  assert.equal(result.ok, true);
  assert.equal(edited, true);
});
test('does not attempt duplicate acknowledgement when Discord rejects the response', async () => {
  let attempts = 0;
  const interaction = { reply: async () => { attempts++; const e = new Error('expired'); e.code = 10062; throw e; }, followUp: async () => { attempts++; } };
  const result = await respondToInteraction(interaction, { content: 'hello' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'interaction-expired');
  assert.equal(attempts, 1);
});
test('returns a structured result for a non-repliable interaction', async () => {
  assert.deepEqual(await respondToInteraction({ isRepliable: () => false }, {}), { ok: false, reason: 'not-repliable' });
});
