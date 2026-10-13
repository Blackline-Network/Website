'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DATABASE_PATH = path.join(__dirname, '..', 'data', 'dynasties.json');

function isValidTimezone(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
        return true;
    } catch (_) {
        return false;
    }
}

function runStartupPreflight({ env = process.env, databasePath = DEFAULT_DATABASE_PATH, exists = fs.existsSync, readFile = file => fs.readFileSync(file, 'utf8') } = {}) {
    const errors = [];
    const warnings = [];
    if (typeof env.TOKEN !== 'string' || !env.TOKEN.trim()) {
        errors.push('TOKEN is missing. Add the Discord bot token to the environment or .env file.');
    } else if (/\s/.test(env.TOKEN.trim())) {
        errors.push('TOKEN contains whitespace; check that the full Discord bot token was copied correctly.');
    }

    if (env.DEFAULT_TIMEZONE && !isValidTimezone(env.DEFAULT_TIMEZONE)) {
        errors.push(`DEFAULT_TIMEZONE is not a recognized IANA timezone: ${env.DEFAULT_TIMEZONE}`);
    }
    for (const name of ['DYNASTY_MANAGER_ROLES', 'BL_STAFF_ROLES']) {
        if (env[name] !== undefined && !env[name].split(',').some(role => role.trim())) {
            warnings.push(`${name} is configured but contains no usable role names.`);
        }
    }

    if (!exists(databasePath)) {
        warnings.push(`Database file not found at ${databasePath}. Ensure data/dynasties.json is installed before league workflows run.`);
    } else {
        try {
            const database = JSON.parse(readFile(databasePath));
            if (!database || typeof database !== 'object' || Array.isArray(database) || !Array.isArray(database.dynasties)) {
                errors.push('Database file must contain a JSON object with a dynasties array.');
            }
        } catch (error) {
            errors.push(`Database file cannot be parsed as JSON: ${error.message}`);
        }
    }
    return { ok: errors.length === 0, errors, warnings };
}

module.exports = { runStartupPreflight, isValidTimezone, DEFAULT_DATABASE_PATH };
