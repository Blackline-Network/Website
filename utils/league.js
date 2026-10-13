const fs = require('fs');
const path = require('path');
const { atomicJsonWrite } = require('./atomicJsonWrite');
const { trackDatabase, assertSnapshotCurrent } = require('./databaseSnapshotTracker');

const dataPath = path.join(__dirname, '..', 'data', 'dynasties.json');

const PHASES = [
    { key: 'offseason', label: 'Off-Season' },
    { key: 'preseason', label: 'Preseason' },
    { key: 'week0', label: 'Week 0' },
    ...Array.from({ length: 15 }, (_, i) => ({ key: `week${i + 1}`, label: `Week ${i + 1}` }))
];

function phaseIndex(phase) {
    const index = PHASES.findIndex(item => item.key === phase);
    return index === -1 ? 0 : index;
}

function getPhaseLabel(dynasty) {
    return dynasty.currentPhaseLabel || PHASES[phaseIndex(dynasty.currentPhase)].label;
}

function getNextPhase(dynasty) {
    const index = phaseIndex(dynasty.currentPhase);
    return PHASES[Math.min(index + 1, PHASES.length - 1)];
}

function loadDatabase() {
    try {
        const raw = fs.readFileSync(dataPath, 'utf8');
        const database = JSON.parse(raw);
        if (!database || !Array.isArray(database.dynasties)) {
            throw new Error('dynasties.json must contain a "dynasties" array.');
        }

        // Remember the exact on-disk snapshot so a stale in-memory copy cannot silently overwrite newer data.
        trackDatabase(database, raw);
        let changed = false;
        if (!database.settings) {
            database.settings = {
                defaultTimezone: 'America/New_York',
                automaticAdvance: true,
                advanceDays: [1, 3, 5],
                advanceHour: 21
            };
            changed = true;
        }

        for (const dynasty of database.dynasties) {
            if (!Array.isArray(dynasty.coaches)) {
                dynasty.coaches = [];
                changed = true;
            }
            const calculatedCount = dynasty.coaches.length;
            if (dynasty.coachCount !== calculatedCount) {
                dynasty.coachCount = calculatedCount;
                changed = true;
            }
            if (!dynasty.maxCoaches) {
                dynasty.maxCoaches = 32;
                changed = true;
            }
            if (!dynasty.currentPhase) {
                dynasty.currentPhase = dynasty.currentWeek === 1 ? 'offseason' : `week${dynasty.currentWeek}`;
                dynasty.currentPhaseLabel = PHASES[phaseIndex(dynasty.currentPhase)].label;
                changed = true;
            }
            if (!dynasty.currentPhaseLabel) {
                dynasty.currentPhaseLabel = PHASES[phaseIndex(dynasty.currentPhase)].label;
                changed = true;
            }
            if (!dynasty.seasonYear) {
                dynasty.seasonYear = 2026 + Math.max(0, (dynasty.season || 1) - 1);
                changed = true;
            }
            if (!dynasty.connection) {
                dynasty.connection = { username: 'Not Set', password: 'Not Set' };
                changed = true;
            }
            if (!dynasty.rules) {
                dynasty.rules = [];
                changed = true;
            }
            if (!dynasty.settings) {
                dynasty.settings = {};
                changed = true;
            }
            if (dynasty.automaticAdvance === undefined) {
                dynasty.automaticAdvance = true;
                changed = true;
            }
            if (!dynasty.advanceTimezone) {
                dynasty.advanceTimezone = database.settings.defaultTimezone;
                changed = true;
            }
            if (!Array.isArray(dynasty.coaches)) dynasty.coaches = [];
            if (!Array.isArray(dynasty.teamSelections)) { dynasty.teamSelections = []; changed = true; }
            if (!dynasty.teamEmojis || typeof dynasty.teamEmojis !== 'object') { dynasty.teamEmojis = {}; changed = true; }
            if (dynasty.guildId === undefined) { dynasty.guildId = null; changed = true; }
            for (const coach of dynasty.coaches) {
                if (!coach.timezone) {
                    coach.timezone = database.settings.defaultTimezone;
                    changed = true;
                }
            }
        }

        if (changed) saveDatabase(database);
        return database;
    } catch (error) {
        console.error('Could not load dynasties database:', error);
        throw error;
    }
}

function saveDatabase(database) {
    // Optimistic concurrency guard: reject a tracked snapshot if another workflow/process
    // has changed the file since it was loaded, rather than silently clobbering that update.
    let currentRaw = null;
    try { currentRaw = fs.readFileSync(dataPath, 'utf8'); }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    if (currentRaw !== null) assertSnapshotCurrent(database, currentRaw);
    else if (database && typeof database === 'object') {
        // A tracked snapshot cannot safely recreate a file that disappeared after load.
        assertSnapshotCurrent(database, '');
    }
    const result = atomicJsonWrite(dataPath, database, {
        indent: 4,
        validate: value => value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.dynasties)
            ? true
            : 'Database must be a JSON object containing a dynasties array; refusing to save.'
    });
    // Refresh the baseline for repeated saves of the same object during a command.
    trackDatabase(database, fs.readFileSync(dataPath, 'utf8'));
    return result;
}

function getActiveDynasties(database) {
    return database.dynasties.filter(dynasty => dynasty.status === 'active');
}

function getTotalDynastyCount(database) {
    return getActiveDynasties(database).length;
}

function getTotalCoachCount(database) {
    return getActiveDynasties(database).reduce((total, dynasty) => total + dynasty.coaches.length, 0);
}

function getLeagueStats(database) {
    return { dynastyCount: getTotalDynastyCount(database), coachCount: getTotalCoachCount(database) };
}

function formatCoachCount(dynasty) {
    return `${dynasty.coaches.length}/${dynasty.maxCoaches}`;
}

const { buildDashboardEmbed, buildDashboardComponents } = require('./dashboard');

async function findExistingDashboardMessage(client, dynasty) {
    // If an older BLACKLINE build did not save the dashboard message ID,
    // recover the existing message instead of making the owner recreate the league.
    const guilds = dynasty.guildId
        ? client.guilds.cache.filter(g => g.id === dynasty.guildId)
        : client.guilds.cache;

    for (const guild of guilds.values()) {
        let channel = null;
        if (dynasty.dashboardChannelId) {
            channel = await client.channels.fetch(dynasty.dashboardChannelId).catch(() => null);
        }
        if (!channel || !channel.isTextBased() || channel.guild?.id !== guild.id) {
            channel = guild.channels.cache.find(c => c.name === '🏠・league-hub' && c.isTextBased() && dynasty.categoryId && c.parentId === dynasty.categoryId);
        }
        if (!channel || !channel.isTextBased()) continue;

        const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (!messages) continue;

        const targetTitle = `🏈 BLACKLINE — ${dynasty.name}`;
        const existing = messages.find(message =>
            message.author?.id === client.user.id &&
            message.embeds?.some(embed => embed.title === targetTitle)
        );

        if (existing) {
            dynasty.guildId = guild.id;
            dynasty.dashboardChannelId = channel.id;
            dynasty.dashboardMessageId = existing.id;
            return existing;
        }
    }
    return null;
}

async function updateDashboardMessage(client, dynasty, database) {
    try {
        let channel = dynasty.dashboardChannelId
            ? await client.channels.fetch(dynasty.dashboardChannelId).catch(() => null)
            : null;
        let message = null;

        if (channel?.isTextBased() && dynasty.dashboardMessageId) {
            message = await channel.messages.fetch(dynasty.dashboardMessageId).catch(() => null);
        }

        // Automatically recover an existing League Hub dashboard when an older
        // file update did not have the message IDs saved. Never create a second panel.
        if (!message) message = await findExistingDashboardMessage(client, dynasty);
        if (!message) {
            console.warn(`Could not find the existing League Hub dashboard for ${dynasty.name}.`);
            return false;
        }

        dynasty.dashboardChannelId = message.channelId;
        dynasty.dashboardMessageId = message.id;
        await message.edit({ content: '', embeds: [buildDashboardEmbed(dynasty)], components: buildDashboardComponents(dynasty), allowedMentions: { parse: [] } });
        return true;
    } catch (error) {
        console.error(`Could not update dashboard for ${dynasty.name}:`, error);
        return false;
    }
}

async function updateAllDashboards(client) {
    const database = loadDatabase();
    let updated = 0;
    let changed = false;
    for (const dynasty of getActiveDynasties(database)) {
        const beforeChannel = dynasty.dashboardChannelId;
        const beforeMessage = dynasty.dashboardMessageId;
        if (await updateDashboardMessage(client, dynasty, database)) updated++;
        if (beforeChannel !== dynasty.dashboardChannelId || beforeMessage !== dynasty.dashboardMessageId) changed = true;
    }
    if (changed) saveDatabase(database);
    console.log(`League Hub startup sync: ${updated}/${getActiveDynasties(database).length} dashboards updated.`);
    return getLeagueStats(database);
}

function findDynasty(database, name) {
    return database.dynasties.find(dynasty => dynasty.name.toLowerCase() === name.toLowerCase());
}

function syncCoachCount(dynasty) {
    dynasty.coachCount = dynasty.coaches.length;
}

function addCoach(dynasty, user, timezone = 'America/New_York') {
    if (dynasty.coaches.some(coach => coach.userId === user.id)) return { success: false, reason: 'already_registered' };
    if (dynasty.coaches.length >= dynasty.maxCoaches) return { success: false, reason: 'full' };
    dynasty.coaches.push({ userId: user.id, username: user.tag || user.username, timezone, joinedAt: new Date().toISOString() });
    syncCoachCount(dynasty);
    return { success: true };
}

function removeCoach(dynasty, userId) {
    const originalLength = dynasty.coaches.length;
    dynasty.coaches = dynasty.coaches.filter(coach => coach.userId !== userId);
    syncCoachCount(dynasty);
    return { success: dynasty.coaches.length !== originalLength };
}

function setCoachTimezone(dynasty, userId, timezone) {
    const coach = dynasty.coaches.find(item => item.userId === userId);
    if (!coach) return false;
    coach.timezone = timezone;
    return true;
}

function advanceDynasty(dynasty) {
    const currentIndex = phaseIndex(dynasty.currentPhase);
    const nextIndex = Math.min(currentIndex + 1, PHASES.length - 1);
    const next = PHASES[nextIndex];
    const wasFinalWeek = currentIndex === PHASES.length - 1;

    if (wasFinalWeek) {
        dynasty.season += 1;
        dynasty.seasonYear += 1;
        dynasty.currentPhase = 'offseason';
        dynasty.currentPhaseLabel = 'Off-Season';
    } else {
        dynasty.currentPhase = next.key;
        dynasty.currentPhaseLabel = next.label;
    }

    const weekMatch = dynasty.currentPhase.match(/^week(\d+)$/);
    dynasty.currentWeek = weekMatch ? Number(weekMatch[1]) : 0;
    dynasty.lastAdvancedAt = new Date().toISOString();
    dynasty.nextAdvance = 'Automatic: Monday, Wednesday & Friday at 9:00 PM local time';
    return dynasty;
}

module.exports = {
    PHASES,
    loadDatabase,
    saveDatabase,
    getActiveDynasties,
    getTotalDynastyCount,
    getTotalCoachCount,
    getLeagueStats,
    formatCoachCount,
    updateDashboardMessage,
    updateAllDashboards,
    findDynasty,
    addCoach,
    removeCoach,
    syncCoachCount,
    setCoachTimezone,
    getPhaseLabel,
    advanceDynasty
};
