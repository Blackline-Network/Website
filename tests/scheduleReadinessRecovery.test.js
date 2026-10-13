const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReadinessCustomId, boundedLines, canCreateReadinessPanel } = require('../utils/readiness');

test('readiness parser handles encoded dynasty names and explicit ready state', () => {
    assert.deepEqual(parseReadinessCustomId('blackline_readiness_My%20Dynasty_ready'), { name: 'My Dynasty', ready: true });
    assert.deepEqual(parseReadinessCustomId('blackline_readiness_My%20Dynasty_notready'), { name: 'My Dynasty', ready: false });
});

test('readiness parser rejects malformed or unrelated component IDs without throwing', () => {
    assert.equal(parseReadinessCustomId('blackline_readiness_%E0%A4%A_ready'), null);
    assert.equal(parseReadinessCustomId('blackline_readiness_MyDynasty'), null);
    assert.equal(parseReadinessCustomId('blackline_competition_refresh:1'), null);
    assert.equal(parseReadinessCustomId(null), null);
});

test('readiness parser preserves underscores in dynasty names', () => {
    assert.deepEqual(parseReadinessCustomId('blackline_readiness_Fall_League_2026_ready'), { name: 'Fall_League_2026', ready: true });
});

test('readiness embed fields remain under Discord 1024-character field limit', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Coach ${i + 1}: Team Name · <@${String(i).padStart(18, '1')}>`);
    const result = boundedLines(lines);
    assert.ok(result.length <= 1024);
    assert.ok(result.includes('more'));
    assert.equal(result.includes('Coach 50'), false);
});

test('bounded line rendering preserves all content when it fits', () => {
    assert.equal(boundedLines(['Alpha', 'Beta']), 'Alpha\nBeta');
});


test('readiness refresh does not create a replacement when a saved message reference is stale', () => {
    assert.equal(canCreateReadinessPanel({ savedMessageId: 'deleted-message', historyFetched: true, recoveredMessage: null }), false);
});

test('readiness refresh fails closed when channel history cannot be fetched', () => {
    assert.equal(canCreateReadinessPanel({ savedMessageId: null, historyFetched: false, recoveredMessage: null }), false);
});

test('readiness refresh may create a panel only when no saved reference exists and history was checked', () => {
    assert.equal(canCreateReadinessPanel({ savedMessageId: null, historyFetched: true, recoveredMessage: null }), true);
});

test('readiness recovery never creates a duplicate when an existing panel was recovered', () => {
    assert.equal(canCreateReadinessPanel({ savedMessageId: null, historyFetched: true, recoveredMessage: { id: 'existing' } }), false);
});
