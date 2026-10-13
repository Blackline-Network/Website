'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { atomicJsonWrite } = require('../utils/atomicJsonWrite');
function fixture() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blackline-atomic-')); return { dir, file: path.join(dir, 'dynasties.json') }; }

test('atomic JSON write persists parseable JSON and returns byte count', () => {
  const f = fixture();
  const result = atomicJsonWrite(f.file, { dynasties: [{ name: 'League' }] });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { dynasties: [{ name: 'League' }] });
  assert.equal(result.bytes, Buffer.byteLength(fs.readFileSync(f.file, 'utf8')));
  assert.deepEqual(fs.readdirSync(f.dir), ['dynasties.json']);
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('validation failure leaves the previous live file untouched', () => {
  const f = fixture(); fs.writeFileSync(f.file, '{"dynasties":[]}');
  assert.throws(() => atomicJsonWrite(f.file, { wrong: true }, { validate: v => Array.isArray(v.dynasties) || 'missing dynasties' }), /missing dynasties/);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{"dynasties":[]}');
  assert.deepEqual(fs.readdirSync(f.dir), ['dynasties.json']);
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('failed serialization does not replace the live file', () => {
  const f = fixture(); fs.writeFileSync(f.file, '{"dynasties":[]}');
  const circular = {}; circular.self = circular;
  assert.throws(() => atomicJsonWrite(f.file, circular), /circular|serialize/i);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{"dynasties":[]}');
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('unique temp names allow sequential writes without stale temp collisions', () => {
  const f = fixture();
  atomicJsonWrite(f.file, { dynasties: [{ name: 'First' }] });
  atomicJsonWrite(f.file, { dynasties: [{ name: 'Second' }] });
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).dynasties[0].name, 'Second');
  assert.deepEqual(fs.readdirSync(f.dir), ['dynasties.json']);
  fs.rmSync(f.dir, { recursive: true, force: true });
});
