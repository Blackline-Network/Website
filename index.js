require('dotenv').config();

const { runStartupPreflight } = require('./utils/startupPreflight');
const startupPreflight = runStartupPreflight();
for (const warning of startupPreflight.warnings) console.warn(`[Startup preflight] WARN: ${warning}`);
if (!startupPreflight.ok) {
    for (const error of startupPreflight.errors) console.error(`[Startup preflight] FAIL: ${error}`);
    console.error('BLACKLINE startup stopped before connecting to Discord. Correct the configuration and restart.');
    process.exit(1);
}

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events, REST, Routes, PermissionFlagsBits } = require('discord.js');
const {
    loadDatabase, saveDatabase, updateAllDashboards, getActiveDynasties,
    advanceDynasty, setCoachTimezone
} = require('./utils/league');
const { refreshDynastyPanels } = require('./utils/panelSync');
const { phaseSnapshot, recordAdvance, recordAdvanceBlocked, recordPanelSync } = require('./utils/advanceAudit');
const { checkAdvancePreflight } = require('./utils/advancePreflight');
const { processWebsiteActions } = require('./utils/websiteActionBridge');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];
for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command && 'execute' in command) {
        const commandName = command.data.name;
        if (client.commands.has(commandName)) {
            throw new Error(`Duplicate BLACKLINE slash command name: ${commandName} (while loading ${file})`);
        }
        client.commands.set(commandName, command);
        commands.push(command.data.toJSON());
        console.log(`Loaded command: ${commandName}`);
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
    const applicationId = client.user.id;
    const guilds = [...client.guilds.cache.values()];
    const commandNames = commands.map(command => command.name);
    if (new Set(commandNames).size !== commandNames.length) {
        throw new Error('Refusing to register duplicate BLACKLINE slash command names.');
    }
    if (commands.length > 100) {
        throw new Error(`BLACKLINE defines ${commands.length} top-level commands; Discord guilds allow at most 100.`);
    }

    // Keep the command set guild-scoped and remove obsolete global definitions.
    try {
        await rest.put(Routes.applicationCommands(applicationId), { body: [] });
    } catch (error) {
        console.error('Could not clear global Discord commands:', error);
    }

    let registeredGuilds = 0;
    for (const guild of guilds) {
        try {
            // Bulk overwrite is atomic for the guild command set and avoids one API
            // request per command, reducing rate-limit risk and stale definitions.
            await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), { body: commands });
            registeredGuilds++;
            console.log(`Registered ${commands.length} BLACKLINE slash commands for ${guild.name}.`);
        } catch (error) {
            console.error(`Could not register BLACKLINE commands for ${guild.name}:`, error);
        }
    }

    if (guilds.length && registeredGuilds !== guilds.length) {
        console.error(`BLACKLINE command registration incomplete: ${registeredGuilds}/${guilds.length} guilds updated.`);
    } else {
        console.log(`BLACKLINE command registration complete: ${commands.length} commands across ${registeredGuilds} guild(s).`);
    }
}

async function setDynastyRole(guild, dynasty, userId, shouldHaveRole) {
    try {
        if (!guild || !dynasty?.discordRoleId) return false;
        const member = await guild.members.fetch(userId);
        const role = guild.roles.cache.get(dynasty.discordRoleId) || await guild.roles.fetch(dynasty.discordRoleId).catch(() => null);
        if (!role) return false;
        if (role.position >= guild.members.me.roles.highest.position) return false;
        if (shouldHaveRole) await member.roles.add(role, `BLACKLINE ${dynasty.name} membership`);
        else await member.roles.remove(role, `BLACKLINE ${dynasty.name} membership removal`);
        return true;
    } catch (error) {
        console.error(`Could not ${shouldHaveRole ? 'add' : 'remove'} dynasty role for ${userId}:`, error);
        return false;
    }
}

async function notifyCoachAtLocalNine(client, dynasty, coach) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: coach.timezone || 'America/New_York',
            weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
        const hour = Number(values.hour);
        const minute = Number(values.minute);
        if (!['Mon', 'Wed', 'Fri'].includes(values.weekday) || hour !== 21 || minute !== 0) return false;

        const member = await client.users.fetch(coach.userId);
        await member.send(`🏈 **BLACKLINE — ${dynasty.name}**\nIt is 9:00 PM in your timezone. The league's scheduled advance window is active. Current phase: **${dynasty.currentPhaseLabel}**.`);
        return true;
    } catch (_) {
        return false;
    }
}

let schedulerBusy = false;
async function runLeagueScheduler() {
    if (schedulerBusy) return;
    schedulerBusy = true;
    try {
        const database = loadDatabase();
        const now = new Date();
        const advancedDynasties = [];

        // The actual league state advances once per scheduled M/W/F window.
        // Each dynasty can have its own advance timezone; it defaults to Eastern.
        for (const dynasty of getActiveDynasties(database)) {
            if (dynasty.automaticAdvance === false) continue;
            const timezone = dynasty.advanceTimezone || database.settings.defaultTimezone || 'America/New_York';
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
            }).formatToParts(now);
            const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
            const weekday = v.weekday;
            const hour = Number(v.hour);
            const minute = Number(v.minute);
            const scheduledDay = ['Mon', 'Wed', 'Fri'].includes(weekday);
            const localDate = `${v.year}-${v.month}-${v.day}`;

            if (scheduledDay && hour === 21 && minute === 0 && dynasty.lastAutomaticAdvanceDate !== localDate && dynasty.lastAutomaticAdvanceAttemptDate !== localDate) {
                dynasty.lastAutomaticAdvanceAttemptDate = localDate;
                const preflight = checkAdvancePreflight(dynasty);
                if (!preflight.allowed) {
                    recordAdvanceBlocked(dynasty, { source: 'automatic', blockers: preflight.blockers });
                    console.warn(`Automatic advance blocked for ${dynasty.name}: ${preflight.blockers.join(' | ')}`);
                } else {
                    const before = phaseSnapshot(dynasty);
                    advanceDynasty(dynasty);
                    recordAdvance(dynasty, { source: 'automatic', actorId: 'system', actorTag: 'BLACKLINE Scheduler', from: before });
                    dynasty.advanceReadiness = {};
                    dynasty.lastAutomaticAdvanceDate = localDate;
                    advancedDynasties.push(dynasty.name);
                    console.log(`Automatically advanced ${dynasty.name} on ${localDate} (${timezone}).` );
                }
            }

            for (const coach of dynasty.coaches) {
                await notifyCoachAtLocalNine(client, dynasty, coach);
            }
        }

        saveDatabase(database);
        // Only run the full panel sync when a dynasty actually advanced.
        // This refreshes every panel that can display the current week/phase
        // or next advance details, not just the League Hub.
        for (const dynastyName of advancedDynasties) {
            const panelSync = await refreshDynastyPanels(client, dynastyName);
            const latest = loadDatabase();
            const stored = latest.dynasties.find(item => item.name.toLocaleLowerCase() === dynastyName.toLocaleLowerCase());
            if (stored) {
                recordPanelSync(stored, panelSync, { source: 'automatic' });
                saveDatabase(latest);
            }
        }
        await updateAllDashboards(client);
    } catch (error) {
        console.error('League scheduler error:', error);
    } finally {
        schedulerBusy = false;
    }
}

client.once(Events.ClientReady, async readyClient => {
    console.log(`${readyClient.user.tag} is online!`);
    await registerCommands();
    try {
        const { syncCreatorConnectionsPanel } = require('./utils/creatorConnectionsPanel');
        await syncCreatorConnectionsPanel(client);
    } catch (error) { console.error('Creator Connections panel startup sync failed:', error); }
    try { await updateAllDashboards(client); } catch (error) { console.error('Dashboard startup sync failed:', error); }
    // Normalize every saved team-selection panel on startup. This updates old/stale
    // messages in place and ensures page 1 displays only teams 1-25.
    try {
        const teamCommand = client.commands.get('teams');
        const db = loadDatabase();
        let synced = 0;
        for (const dynasty of (db.dynasties || []).filter(d => d.status === 'active' && d.teamChannelId && d.teamMessageId)) {
            if (teamCommand && typeof teamCommand.refreshPanel === 'function') {
                const ok = await teamCommand.refreshPanel(client, dynasty, 0);
                if (ok) synced++;
            }
        }
        console.log(`Team panel startup sync: ${synced} existing panels normalized to page 1 (teams 1–25).`);
    } catch (error) { console.error('Team panel startup sync failed:', error); }
    try {
        const dynastyCommand = client.commands.get('dynasty');
        const db = loadDatabase();
        for (const dynasty of getActiveDynasties(db)) {
            if (dynastyCommand?.refreshSchedulePanel) await dynastyCommand.refreshSchedulePanel(client, dynasty);
        }
    } catch (error) { console.error('Schedule readiness startup sync failed:', error); }
    try {
        const leagueCommand = client.commands.get('league');
        const db = loadDatabase();
        let synced = 0;
        for (const dynasty of getActiveDynasties(db)) {
            if (leagueCommand?.refreshCompetitionPanel && await leagueCommand.refreshCompetitionPanel(client, dynasty)) synced++;
        }
        console.log(`Competition panel startup sync: ${synced} existing panels refreshed.`);
    } catch (error) { console.error('Competition panel startup sync failed:', error); }
    try {
        const leagueCommand = client.commands.get('league');
        const db = loadDatabase();
        let synced = 0;
        for (const dynasty of getActiveDynasties(db)) {
            if (leagueCommand?.refreshHistoryPanel && await leagueCommand.refreshHistoryPanel(client, dynasty)) synced++;
        }
        console.log(`League history panel startup sync: ${synced} existing panels refreshed.`);
    } catch (error) { console.error('League history panel startup sync failed:', error); }
    try {
        const disputeCommand = client.commands.get('dispute');
        for (const guild of client.guilds.cache.values()) {
            if (disputeCommand?.syncPanel) await disputeCommand.syncPanel(client, guild);
        }
    } catch (error) { console.error('Dispute panel startup sync failed:', error); }
    // Panel IDs may have been recovered above; update the Hub links after all panels sync.
    try { await updateAllDashboards(client); } catch (error) { console.error('Final League Hub navigation sync failed:', error); }
    await runLeagueScheduler();
    setInterval(runLeagueScheduler, 60 * 1000);
    // Website requests are processed by the bot process so claims reuse existing validation and database conflict guards.
    setInterval(() => processWebsiteActions(client).catch(error => console.error('Website action bridge error:', error.message)), 3000);
    processWebsiteActions(client).catch(error => console.error('Website action bridge startup check failed:', error.message));
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const staffRoles = (process.env.BL_STAFF_ROLES || 'BL Staff').split(',').map(x => x.trim()).filter(Boolean);
            const memberRoles = interaction.member?.roles?.cache;
            const isBLStaff = !!memberRoles && memberRoles.some(role => staffRoles.includes(role.name) || staffRoles.includes(role.id));
            if (!isBLStaff) return interaction.reply({ content: '🔒 BLACKLINE slash commands are restricted to staff. Players should use the buttons and menus in the panels.', ephemeral: true });
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('blackline_coach_profile_modal:')) {
            const leagueCommand = client.commands.get('league');
            if (leagueCommand?.handleCoachProfileModal) await leagueCommand.handleCoachProfileModal(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('blackline_score_report_modal:')) {
            const leagueCommand = client.commands.get('league');
            if (leagueCommand?.handleScoreReportModal) await leagueCommand.handleScoreReportModal(interaction);
            return;
        }

        if (interaction.isModalSubmit() && interaction.customId === 'blackline_dispute_submit_modal') {
            const disputeCommand = client.commands.get('dispute');
            if (disputeCommand?.handleModal) await disputeCommand.handleModal(interaction);
            return;
        }

        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            if (interaction.isButton() && interaction.customId.startsWith('blackline_poll_vote:')) {
                const pollCommand = client.commands.get('poll');
                if (pollCommand?.handlePollButton) await pollCommand.handlePollButton(interaction);
                return;
            }
            if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('blackline_coach_')) {
                const leagueCommand = client.commands.get('league');
                if (leagueCommand?.handleCoachComponent) await leagueCommand.handleCoachComponent(interaction);
                return;
            }
            if (interaction.isButton() && interaction.customId.startsWith('blackline_score_review:')) {
                const leagueCommand = client.commands.get('league');
                if (leagueCommand?.handleScoreReviewButton) await leagueCommand.handleScoreReviewButton(interaction);
                return;
            }
            if ((interaction.isButton() || interaction.isStringSelectMenu()) && (interaction.customId.startsWith('blackline_competition_') || interaction.customId.startsWith('blackline_history_'))) {
                const leagueCommand = client.commands.get('league');
                if (leagueCommand?.handleCompetitionButton) await leagueCommand.handleCompetitionButton(interaction);
                return;
            }
            if (interaction.isButton() && interaction.customId.startsWith('blackline_dispute_')) {
                const disputeCommand = client.commands.get('dispute');
                if (disputeCommand?.handleButton) await disputeCommand.handleButton(interaction);
                return;
            }
            if (interaction.isButton() && interaction.customId.startsWith('blackline_readiness_')) {
                const dynastyCommand = client.commands.get('dynasty');
                if (dynastyCommand?.handleReadinessButton) await dynastyCommand.handleReadinessButton(interaction);
                return;
            }
            if (!interaction.customId.startsWith('blackline_team_')) return;
            const teamsCommand = client.commands.get('teams');
            if (teamsCommand?.handleComponent) await teamsCommand.handleComponent(interaction);
        }
    } catch (error) {
        console.error('BLACKLINE interaction error:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ Something went wrong while processing that action.', ephemeral: true }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Something went wrong while processing that action.', ephemeral: true }).catch(() => {});
        }
    }
});

// Expose role helpers to command modules without creating a second Discord client.
client.blackline = { setDynastyRole, setCoachTimezone };

client.login(process.env.TOKEN);
