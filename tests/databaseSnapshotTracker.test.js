'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { trackDatabase, assertSnapshotCurrent, fingerprint } = require('../utils/databaseSnapshotTracker');

test('tracked snapshot accepts unchanged on-disk content', () => {
  const db = { dynasties: [{ name: 'League' }] };
  const raw = JSON.stringify(db);
  trackDatabase(db, raw);
  assert.deepEqual(assertSnapshotCurrent(db, raw), { tracked: true });
});

test('tracked snapshot rejects a changed on-disk database with actionable conflict code', () => {
  const db = { dynasties: [{ name: 'League', wins: 1 }] };
  trackDatabase(db, JSON.stringify(db));
  assert.throws(
    () => assertSnapshotCurrent(db, JSON.stringify({ dynasties: [{ name: 'League', wins: 2 }] })),
    error => error.code === 'BLACKLINE_DATABASE_WRITE_CONFLICT' && /Reload the latest database/.test(error.message)
  );
});

test('untracked objects remain supported for first-time or test writes', () => {
  assert.deepEqual(assertSnapshotCurrent({ dynasties: [] }, '{}'), { tracked: false });
});

test('fingerprints are stable for identical bytes and differ for changed bytes', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc'));
  assert.notEqual(fingerprint('abc'), fingerprint('abd'));
});
