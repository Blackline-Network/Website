const test = require('node:test');
const assert = require('node:assert/strict');
const { auditReleaseMetadata } = require('../utils/releaseAudit');

const validPackage = {
    version: '1.0.100',
    scripts: { test: 'node --test', 'release-audit': 'node scripts/release-audit.js' }
};
const validLock = { version: '1.0.100', packages: { '': { version: '1.0.100' } } };

test('release audit accepts matching package and lockfile versions with required paths', () => {
    const result = auditReleaseMetadata({ packageJson: validPackage, packageLock: validLock, exists: () => true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test('release audit catches a top-level lockfile version mismatch', () => {
    const result = auditReleaseMetadata({ packageJson: validPackage, packageLock: { ...validLock, version: '1.0.99' }, exists: () => true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('top-level version')));
});

test('release audit catches a root package version mismatch', () => {
    const result = auditReleaseMetadata({ packageJson: validPackage, packageLock: { ...validLock, packages: { '': { version: '1.0.99' } } }, exists: () => true });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('root package version')));
});

test('release audit catches missing required project paths and test script', () => {
    const result = auditReleaseMetadata({ packageJson: { version: '1.0.100', scripts: {} }, packageLock: validLock, exists: path => path !== 'tests' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.includes('Required release path is missing: tests')));
    assert.ok(result.errors.some(error => error.includes('does not define a test script')));
});
