'use strict';
const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '..', 'data');
const backupDir = path.join(dataDir, 'backups');
const sourcePath = path.join(dataDir, 'dynasties.json');

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}
function createDatabaseBackup(database, now = new Date()) {
  fs.mkdirSync(backupDir, { recursive: true });
  const fileName = `dynasties-${safeTimestamp(now)}.json`;
  const target = path.join(backupDir, fileName);
  const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : JSON.stringify(database, null, 4);
  // Validate before persisting; never overwrite the live database.
  JSON.parse(source);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, source, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temp, target);
  return { fileName, path: target, bytes: Buffer.byteLength(source, 'utf8'), createdAt: now.toISOString() };
}
function listDatabaseBackups(limit = 10) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir).filter(name => /^dynasties-.*\.json$/.test(name)).map(fileName => {
    const fullPath = path.join(backupDir, fileName);
    const stat = fs.statSync(fullPath);
    return { fileName, path: fullPath, bytes: stat.size, createdAt: stat.mtime.toISOString() };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, Math.min(100, limit)));
}
function appendAuditEntry(dynasty, { action, actorId, actorTag, details = {} }, now = new Date()) {
  if (!Array.isArray(dynasty.staffAuditLog)) dynasty.staffAuditLog = [];
  const safeDetails = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) safeDetails[key] = String(value).slice(0, 160);
  }
  dynasty.staffAuditLog.push({ at: now.toISOString(), action: String(action).slice(0, 80), actorId: String(actorId || 'unknown'), actorTag: String(actorTag || '').slice(0, 100), details: safeDetails });
  if (dynasty.staffAuditLog.length > 500) dynasty.staffAuditLog.splice(0, dynasty.staffAuditLog.length - 500);
  return dynasty.staffAuditLog[dynasty.staffAuditLog.length - 1];
}
function validateChampionScore(champion, runnerUp, championScore, runnerUpScore) {
  if ((championScore === null || championScore === undefined) !== (runnerUpScore === null || runnerUpScore === undefined)) return 'Enter both final scores or leave both blank.';
  if (championScore === null || championScore === undefined) return null;
  if (!runnerUp) return 'Enter the runner-up team when providing a championship score.';
  if (String(champion).trim().toLocaleLowerCase() === String(runnerUp).trim().toLocaleLowerCase()) return 'Champion and runner-up must be different teams.';
  if (championScore === runnerUpScore) return 'A championship game cannot end tied. Enter the final score after overtime.';
  if (championScore < runnerUpScore) return 'The champion score must be greater than the runner-up score. Check the teams and scores.';
  return null;
}
function formatAuditEntry(entry) {
  const details = Object.entries(entry.details || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return `• [${new Date(entry.at).toLocaleString()}] ${entry.action} — <@${entry.actorId}>${details ? ` — ${details}` : ''}`;
}
module.exports = { createDatabaseBackup, listDatabaseBackups, appendAuditEntry, formatAuditEntry, safeTimestamp, validateChampionScore };

function validateDatabaseShape(database) {
  const errors = [];
  const warnings = [];
  if (!database || typeof database !== 'object' || Array.isArray(database)) {
    return { valid: false, errors: ['Database root must be a JSON object.'], warnings, summary: null };
  }
  if (!Array.isArray(database.dynasties)) {
    return { valid: false, errors: ['Database must contain a "dynasties" array.'], warnings, summary: null };
  }
  const names = new Set();
  let coaches = 0;
  for (let i = 0; i < database.dynasties.length; i++) {
    const dynasty = database.dynasties[i];
    const prefix = `dynasties[${i}]`;
    if (!dynasty || typeof dynasty !== 'object' || Array.isArray(dynasty)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    if (typeof dynasty.name !== 'string' || !dynasty.name.trim()) errors.push(`${prefix}.name must be a non-empty string.`);
    else {
      const key = dynasty.name.trim().toLocaleLowerCase();
      if (names.has(key)) warnings.push(`Duplicate dynasty name "${dynasty.name.trim()}"; name-based lookup may be ambiguous.`);
      names.add(key);
    }
    for (const field of ['coaches', 'teamSelections', 'teams', 'games', 'schedule', 'history', 'historicalRecords']) {
      if (dynasty[field] !== undefined && !Array.isArray(dynasty[field])) warnings.push(`${prefix}.${field} is not an array; review before relying on that feature.`);
    }
    if (Array.isArray(dynasty.coaches)) coaches += dynasty.coaches.length;
    if (dynasty.currentWeek !== undefined && (!Number.isInteger(dynasty.currentWeek) || dynasty.currentWeek < 0)) warnings.push(`${prefix}.currentWeek is not a non-negative integer.`);
    if (dynasty.season !== undefined && (!Number.isInteger(dynasty.season) || dynasty.season < 1)) warnings.push(`${prefix}.season is not a positive integer.`);
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { dynasties: database.dynasties.length, coaches, hasSettings: Boolean(database.settings) }
  };
}

function readAndValidateDatabaseFile(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch (error) { return { valid: false, errors: [`Could not read file: ${error.message}`], warnings: [], summary: null }; }
  let database;
  try { database = JSON.parse(raw); }
  catch (error) { return { valid: false, errors: [`Invalid JSON: ${error.message}`], warnings: [], summary: null }; }
  return { ...validateDatabaseShape(database), database, bytes: Buffer.byteLength(raw, 'utf8') };
}

function verifyDatabaseBackup(fileName, options = {}) {
  const dir = options.backupDir || backupDir;
  if (typeof fileName !== 'string' || !/^dynasties-[A-Za-z0-9T._-]+\.json$/.test(fileName) || fileName.includes('..')) {
    return { valid: false, errors: ['Invalid backup filename. Select a filename from the backup list.'], warnings: [], summary: null };
  }
  const fullPath = path.join(dir, fileName);
  const resolvedDir = path.resolve(dir) + path.sep;
  if (!path.resolve(fullPath).startsWith(resolvedDir)) return { valid: false, errors: ['Backup path is outside the backup directory.'], warnings: [], summary: null };
  const result = readAndValidateDatabaseFile(fullPath);
  return { ...result, fileName, path: fullPath };
}

function restoreDatabaseBackup(fileName, options = {}) {
  const dir = options.backupDir || backupDir;
  const livePath = options.sourcePath || sourcePath;
  const verified = verifyDatabaseBackup(fileName, { backupDir: dir });
  if (!verified.valid) {
    const error = new Error(`Backup validation failed: ${verified.errors.join(' ')}`);
    error.validation = verified;
    throw error;
  }
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  // Preserve the current live bytes before replacing them. This snapshot is kept
  // even if the current file is malformed, so an operator can investigate later.
  if (fs.existsSync(livePath)) {
    const snapshotDir = path.join(dir, 'pre-restore-snapshots');
    fs.mkdirSync(snapshotDir, { recursive: true });
    const snapshotName = `live-before-restore-${safeTimestamp(new Date())}.txt`;
    const snapshotTemp = path.join(snapshotDir, `${snapshotName}.tmp`);
    fs.writeFileSync(snapshotTemp, fs.readFileSync(livePath), { flag: 'wx' });
    fs.renameSync(snapshotTemp, path.join(snapshotDir, snapshotName));
  }
  const raw = fs.readFileSync(verified.path, 'utf8');
  const tempPath = `${livePath}.restore.tmp`;
  fs.writeFileSync(tempPath, raw, { encoding: 'utf8', flag: 'w' });
  // Re-parse the exact bytes written to the temporary file before atomic replace.
  const finalCheck = readAndValidateDatabaseFile(tempPath);
  if (!finalCheck.valid) {
    try { fs.unlinkSync(tempPath); } catch (_) {}
    throw new Error(`Restore verification failed: ${finalCheck.errors.join(' ')}`);
  }
  fs.renameSync(tempPath, livePath);
  return { fileName, path: livePath, bytes: Buffer.byteLength(raw, 'utf8'), database: finalCheck.database, summary: finalCheck.summary, warnings: finalCheck.warnings };
}

module.exports.validateDatabaseShape = validateDatabaseShape;
module.exports.readAndValidateDatabaseFile = readAndValidateDatabaseFile;
module.exports.verifyDatabaseBackup = verifyDatabaseBackup;
module.exports.restoreDatabaseBackup = restoreDatabaseBackup;
