'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateDatabaseShape, readAndValidateDatabaseFile, verifyDatabaseBackup, restoreDatabaseBackup } = require('../utils/operations');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackline-recovery-'));
  const backupDir = path.join(root, 'backups');
  const sourcePath = path.join(root, 'data', 'dynasties.json');
  fs.mkdirSync(backupDir, { recursive: true });
  return { root, backupDir, sourcePath };
}

test('database validator rejects invalid roots and missing dynasty arrays', () => {
  assert.equal(validateDatabaseShape(null).valid, false);
  assert.equal(validateDatabaseShape({}).valid, false);
  assert.match(validateDatabaseShape({ dynasties: [{ name: '' }] }).errors[0], /name/);
});

test('database validator reports duplicate names and malformed optional arrays as warnings', () => {
  const result = validateDatabaseShape({ dynasties: [{ name: 'Alabama', coaches: [] }, { name: ' alabama ', coaches: 'bad' }] });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => /Duplicate dynasty name/.test(w)));
  assert.ok(result.warnings.some(w => /coaches is not an array/.test(w)));
});

test('backup verification checks both JSON parsing and required database structure', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.backupDir, 'dynasties-broken.json'), '{bad');
  fs.writeFileSync(path.join(f.backupDir, 'dynasties-shape.json'), JSON.stringify({ nope: [] }));
  assert.equal(verifyDatabaseBackup('dynasties-broken.json', { backupDir: f.backupDir }).valid, false);
  assert.equal(verifyDatabaseBackup('dynasties-shape.json', { backupDir: f.backupDir }).valid, false);
  assert.equal(verifyDatabaseBackup('../outside.json', { backupDir: f.backupDir }).valid, false);
  fs.rmSync(f.root, { recursive: true, force: true });
});

test('restore validates backup, preserves pre-restore snapshot, and atomically replaces live database', () => {
  const f = fixture();
  const backupName = 'dynasties-good.json';
  const backupData = { settings: {}, dynasties: [{ name: 'Restored League', coaches: [{ id: '1' }] }] };
  fs.writeFileSync(path.join(f.backupDir, backupName), JSON.stringify(backupData, null, 2));
  fs.mkdirSync(path.dirname(f.sourcePath), { recursive: true });
  fs.writeFileSync(f.sourcePath, JSON.stringify({ dynasties: [{ name: 'Current League' }] }));
  const restored = restoreDatabaseBackup(backupName, { backupDir: f.backupDir, sourcePath: f.sourcePath });
  assert.equal(restored.summary.dynasties, 1);
  assert.equal(JSON.parse(fs.readFileSync(f.sourcePath, 'utf8')).dynasties[0].name, 'Restored League');
  const snapshots = fs.readdirSync(path.join(f.backupDir, 'pre-restore-snapshots'));
  assert.equal(snapshots.length, 1);
  assert.match(fs.readFileSync(path.join(f.backupDir, 'pre-restore-snapshots', snapshots[0]), 'utf8'), /Current League/);
  fs.rmSync(f.root, { recursive: true, force: true });
});

test('restore refuses invalid backup and leaves live database unchanged', () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.backupDir, 'dynasties-bad.json'), JSON.stringify({ dynasties: [{ name: '' }] }));
  fs.mkdirSync(path.dirname(f.sourcePath), { recursive: true });
  fs.writeFileSync(f.sourcePath, JSON.stringify({ dynasties: [{ name: 'Keep Me' }] }));
  assert.throws(() => restoreDatabaseBackup('dynasties-bad.json', { backupDir: f.backupDir, sourcePath: f.sourcePath }), /validation failed/i);
  assert.equal(JSON.parse(fs.readFileSync(f.sourcePath, 'utf8')).dynasties[0].name, 'Keep Me');
  fs.rmSync(f.root, { recursive: true, force: true });
});
