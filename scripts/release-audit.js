#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { auditReleaseMetadata, REQUIRED_PATHS } = require('../utils/releaseAudit');

const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
let packageJson;
let packageLock;
try {
    packageJson = readJson('package.json');
    packageLock = readJson('package-lock.json');
} catch (error) {
    console.error(`Release audit could not read package metadata: ${error.message}`);
    process.exit(1);
}

const metadata = auditReleaseMetadata({
    packageJson,
    packageLock,
    exists: relativePath => fs.existsSync(path.join(root, relativePath)),
    requiredPaths: REQUIRED_PATHS
});
for (const error of metadata.errors) console.error(`FAIL: ${error}`);
for (const warning of metadata.warnings) console.warn(`WARN: ${warning}`);
if (!metadata.ok) process.exit(1);

const collectJs = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collectJs(full);
    return entry.isFile() && full.endsWith('.js') ? [full] : [];
});
const jsFiles = collectJs(root).filter(file => !file.split(path.sep).includes('node_modules'));
let syntaxFailures = 0;
for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        syntaxFailures++;
        console.error(`FAIL: syntax check ${path.relative(root, file)}\n${result.stderr || result.stdout}`);
    }
}
if (syntaxFailures) process.exit(1);
console.log(`Release audit passed for BLACKLINE ${metadata.version}.`);
console.log(`Metadata checks: passed; JavaScript syntax: ${jsFiles.length} files passed.`);
console.log('Note: this audit does not deploy the bot or verify live Discord permissions/API behavior.');
