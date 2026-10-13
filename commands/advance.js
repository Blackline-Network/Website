const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadDatabase, saveDatabase, findDynasty, advanceDynasty, getPhaseLabel } = require('../utils/league');
const { refreshDynastyPanels } = require('../utils/panelSync');
const { phaseSnapshot, recordAdvance, recordPanelSync, recordAdvanceBlocked } = require('../utils/advanceAudit');
const { checkAdvancePreflight } = require('../utils/advancePreflight');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('advance')
        .setDescription('Manually advance a BLACKLINE dynasty.')
        .addStringOption(option => option.setName('name').setDescription('Dynasty name.').setRequired(true)),

    async execute(interaction) {
        const database = loadDatabase();
        const name = interaction.options.getString('name').trim();
        const dynasty = findDynasty(database, name);
        if (!dynasty || dynasty.status !== 'active') {
            return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });
        }
        if (dynasty.commissionerId !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Only the dynasty commissioner or a server administrator can manually advance the league.', ephemeral: true });
        }
        const preflight = checkAdvancePreflight(dynasty);
        if (!preflight.allowed) {
            recordAdvanceBlocked(dynasty, { source: 'manual', actorId: interaction.user.id, actorTag: interaction.user.tag || interaction.user.username, blockers: preflight.blockers });
            saveDatabase(database);
            return interaction.reply({ content: `⛔ **${dynasty.name} was not advanced.**\n\n${preflight.blockers.map(item => `• ${item}`).join('\n')}\n\nResolve the listed issues, then retry. Use \`/league season-audit name:${dynasty.name}\` for schedule integrity details.`, ephemeral: true });
        }
        const before = phaseSnapshot(dynasty);
        advanceDynasty(dynasty);
        // A staff-triggered advance on the scheduled local date must not be followed by a second automatic advance.
        try {
            const parts = new Intl.DateTimeFormat('en-US', { timeZone: dynasty.advanceTimezone || database.settings?.defaultTimezone || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
            const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
            dynasty.lastAutomaticAdvanceDate = `${values.year}-${values.month}-${values.day}`;
        } catch (_) { /* Invalid timezone falls back to the scheduler's normal handling. */ }
        recordAdvance(dynasty, { source: 'manual', actorId: interaction.user.id, actorTag: interaction.user.tag || interaction.user.username, from: before });
        saveDatabase(database);

        const panelSync = await refreshDynastyPanels(interaction.client, dynasty.name);
        const latest = loadDatabase();
        const latestDynasty = findDynasty(latest, dynasty.name);
        if (latestDynasty) { recordPanelSync(latestDynasty, panelSync, { source: 'manual' }); saveDatabase(latest); }

        return interaction.reply({
            content: `⏩ **${dynasty.name}** manually advanced to **${getPhaseLabel(dynasty)}** — **Season ${dynasty.season} (${dynasty.seasonYear})**.\n\n${panelSync.ok ? `✅ All ${panelSync.refreshed.length} panels refreshed.` : `⚠️ Refreshed ${panelSync.refreshed.length} panels. Needs attention: ${panelSync.failed.join(', ')}.`}`,
            ephemeral: true
        });
    }
};
