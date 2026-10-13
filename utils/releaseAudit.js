const REQUIRED_PATHS = [
    'index.js',
    'commands',
    'utils',
    'utils/startupPreflight.js',
    'utils/atomicJsonWrite.js',
    'utils/databaseSnapshotTracker.js',
    'tests',
    'tests/startupPreflight.test.js',
    'tests/atomicJsonWrite.test.js',
    'tests/databaseSnapshotTracker.test.js',
    '.env.example',
    'package.json',
    'package-lock.json',
    'README.md'
];

function auditReleaseMetadata({ packageJson, packageLock, exists = () => true, requiredPaths = REQUIRED_PATHS }) {
    const errors = [];
    const warnings = [];
    const version = packageJson?.version;

    if (!version || typeof version !== 'string') errors.push('package.json is missing a valid version string.');
    if (packageLock?.version !== version) errors.push('package-lock.json top-level version does not match package.json.');
    const lockRootVersion = packageLock?.packages?.['']?.version;
    if (lockRootVersion !== version) errors.push('package-lock.json root package version does not match package.json.');
    if (!packageJson?.scripts?.test) errors.push('package.json does not define a test script.');
    if (!packageJson?.scripts?.['release-audit']) warnings.push('No release-audit script is configured.');

    for (const path of requiredPaths) {
        if (!exists(path)) errors.push(`Required release path is missing: ${path}`);
    }

    return { ok: errors.length === 0, version: version || null, errors, warnings };
}

module.exports = { auditReleaseMetadata, REQUIRED_PATHS };
