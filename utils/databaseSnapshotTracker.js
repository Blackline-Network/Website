'use strict';
const crypto = require('crypto');
const snapshots = new WeakMap();
function fingerprint(raw) { return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex'); }
function trackDatabase(database, raw) {
  if (!database || typeof database !== 'object') throw new TypeError('A database object is required to track a snapshot.');
  snapshots.set(database, fingerprint(raw));
  return database;
}
function assertSnapshotCurrent(database, currentRaw) {
  const expected = database && typeof database === 'object' ? snapshots.get(database) : undefined;
  if (expected === undefined) return { tracked: false };
  const actual = fingerprint(currentRaw);
  if (actual !== expected) {
    const error = new Error('Database save rejected because the on-disk database changed after this snapshot was loaded. Reload the latest database and retry the operation.');
    error.code = 'BLACKLINE_DATABASE_WRITE_CONFLICT';
    error.expectedFingerprint = expected;
    error.actualFingerprint = actual;
    throw error;
  }
  return { tracked: true };
}
module.exports = { fingerprint, trackDatabase, assertSnapshotCurrent };
