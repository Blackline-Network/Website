'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runStartupPreflight, isValidTimezone } = require('../utils/startupPreflight');

const validEnv = { TOKEN: 'test-token-value' };
const validDb = JSON.stringify({ dynasties: [], settings: {} });

 test('startup preflight passes with token and valid database', () => {
    const result = runStartupPreflight({ env: validEnv, databasePath: '/db.json', exists: () => true, readFile: () => validDb });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('startup preflight rejects a missing token', () => {
    const result = runStartupPreflight({ env: {}, exists: () => false });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /TOKEN is missing/);
});

test('startup preflight rejects token whitespace', () => {
    const result = runStartupPreflight({ env: { TOKEN: 'abc def' }, exists: () => false });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /contains whitespace/);
});

test('startup preflight rejects an invalid configured timezone', () => {
    const result = runStartupPreflight({ env: { ...validEnv, DEFAULT_TIMEZONE: 'Moon/Base' }, exists: () => false });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /recognized IANA timezone/);
});

test('startup preflight rejects malformed database JSON', () => {
    const result = runStartupPreflight({ env: validEnv, databasePath: '/db.json', exists: () => true, readFile: () => '{broken' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /cannot be parsed as JSON/);
});

test('startup preflight rejects a database without dynasties array', () => {
    const result = runStartupPreflight({ env: validEnv, databasePath: '/db.json', exists: () => true, readFile: () => '{"settings":{}}' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /dynasties array/);
});

test('missing database is a warning so first-time setup can proceed', () => {
    const result = runStartupPreflight({ env: validEnv, exists: () => false });
    assert.equal(result.ok, true);
    assert.match(result.warnings.join(' '), /Database file not found/);
});

test('timezone validator accepts valid IANA zones and rejects invalid ones', () => {
    assert.equal(isValidTimezone('America/Chicago'), true);
    assert.equal(isValidTimezone('not-a-timezone'), false);
});
