const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    ButtonBuilder, ActionRowBuilder, ButtonStyle
} = require('discord.js');
const {
    loadDatabase, saveDatabase, formatCoachCount, updateAllDashboards,
    findDynasty, addCoach, removeCoach, setCoachTimezone, getPhaseLabel, advanceDynasty
} = require('../utils/league');
const { buildDashboardEmbed, buildDashboardComponents, getNextAdvanceDate } = require('../utils/dashboard');
const { getCoachTeam, getTeamEmoji } = require('../utils/teams');

const DASHBOARD_CHANNEL_NAME = '🏠・league-hub';
const MANAGEMENT_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager')
    .split(',')
    .map(role => role.trim())
    .filter(Boolean);

function findDashboardChannel(guild, categoryId = null) {
    // Resolve channels within the category where the create command was invoked.
    // Never pick a same-named channel from another league's category.
    return guild.channels.cache.find(channel =>
        channel.name === DASHBOARD_CHANNEL_NAME &&
        channel.type === ChannelType.GuildText &&
        (categoryId ? channel.parentId === categoryId : false)
    );
}
function hasManagementRole(interaction) {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    const roles = interaction.member?.roles?.cache;
    if (!roles) return false;
    return roles.some(role => MANAGEMENT_ROLES.includes(role.name) || MANAGEMENT_ROLES.includes(role.id));
}

function canManageDynasty(interaction, dynasty) {
    return hasManagementRole(interaction) && !!dynasty;
}

const { boundedLines, parseReadinessCustomId, canCreateReadinessPanel } = require('../utils/readiness');

function requireManager(interaction, action = 'manage dynasties') {
    if (!hasManagementRole(interaction)) {
        interaction.reply({
            content: `❌ You do not have permission to ${action}. Required Discord role: **${MANAGEMENT_ROLES.join('**, **')}**.`,
            ephemeral: true
        });
        return false;
    }
    return true;
}

async function refreshSchedulePanel(client, dynasty) {
    try {
        const guild = dynasty.guildId ? await client.guilds.fetch(dynasty.guildId).catch(() => null) : null;
        if (!guild) return false;
        // Fetch the guild channel collection instead of trusting a potentially stale cache.
        const channels = await guild.channels.fetch().catch(() => null);
        const cachedChannels = channels || guild.channels.cache;
        let channel = dynasty.scheduleChannelId ? await client.channels.fetch(dynasty.scheduleChannelId).catch(() => null) : null;
        if (!channel?.isTextBased() || channel.guild?.id !== guild.id) channel = null;
        if (!channel) channel = cachedChannels.find(c => c && c.name === '📅・schedule' && c.isTextBased() && (!dynasty.categoryId || c.parentId === dynasty.categoryId));
        if (!channel) return false;
        const coaches = dynasty.coaches || [];
        const readiness = dynasty.advanceReadiness || {};
        const ready = coaches.filter(c => readiness[c.userId]?.ready === true);
        const notReady = coaches.filter(c => readiness[c.userId]?.ready !== true);
        const coachLine = c => { const selection = getCoachTeam(dynasty, c.userId); return `${selection ? `${getTeamEmoji(dynasty, selection.team)} **${selection.team}** · ` : '🏈 **Team not selected** · '}<@${c.userId}>`; };
        const readyList = ready.length ? ready.map(coachLine).join('\n') : '_No coaches marked ready yet._';
        const notReadyList = notReady.length ? notReady.map(coachLine).join('\n') : '✅ Everyone is ready.';
        const timezone = dynasty.advanceTimezone || 'America/New_York';
        const nextAdvance = getNextAdvanceDate(timezone);
        const nextAdvanceUnix = Math.floor(nextAdvance.getTime() / 1000);
        const embed = new EmbedBuilder()
            .setColor(notReady.length ? 0xF0B94A : 0x35B779)
            .setTitle(`📋 ${dynasty.name} · Advance Readiness`)
            .setDescription('Check in below before the next scheduled advance. Your status updates this panel automatically.')
            .addFields(
                { name: '⏰ Next Advance', value: `<t:${nextAdvanceUnix}:F>\n<t:${nextAdvanceUnix}:R>`, inline: true },
                { name: '📆 Current Week', value: `**${getPhaseLabel(dynasty)}**`, inline: true },
                { name: `🟢 Ready · ${ready.length}/${coaches.length}`, value: boundedLines(readyList.split('\n')), inline: false },
                { name: `🟡 Not Ready / Not Checked In · ${notReady.length}`, value: boundedLines(notReadyList.split('\n')), inline: false },
            )
            .setFooter({ text: 'BLACKLINE • Use the button below to update your readiness' })
            .setTimestamp(new Date());
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_readiness_${encodeURIComponent(dynasty.name)}_ready`).setLabel('Ready to Advance').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(`blackline_readiness_${encodeURIComponent(dynasty.name)}_notready`).setLabel('Not Ready to Advance').setStyle(ButtonStyle.Danger).setEmoji('⏳')
        );
        let message = null;
        if (dynasty.scheduleChannelId === channel.id && dynasty.scheduleMessageId) message = await channel.messages.fetch(dynasty.scheduleMessageId).catch(() => null);
        // Recover the existing readiness panel if its ID was lost or the channel moved.
        const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (!message && recent) message = recent.find(m => m.author?.id === client.user.id && m.embeds?.some(e => e.title === `📋 ${dynasty.name} · Advance Readiness`)) || null;
        if (!message && !canCreateReadinessPanel({ savedMessageId: dynasty.scheduleMessageId, historyFetched: !!recent, recoveredMessage: message })) {
            console.warn(`Schedule/readiness panel for ${dynasty.name} was not reposted automatically: a saved message reference may be stale or channel history could not be verified.`);
            return false;
        }
        // Remove the old standalone text readiness post so only the embed panel remains.
        if (recent) {
            for (const oldMessage of recent.values()) {
                if (oldMessage.id === message?.id || oldMessage.author?.id !== client.user.id || oldMessage.embeds?.length) continue;
                const content = oldMessage.content || '';
                if (/Advance Readiness/i.test(content) || (/dynasty ready/i.test(content) && /not checked in|current phase|schedule:/i.test(content))) {
                    await oldMessage.delete().catch(() => {});
                }
            }
        }
        if (message) await message.edit({ content: '', embeds: [embed], components: [row], allowedMentions: { parse: [] } });
        else message = await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
        dynasty.scheduleChannelId = channel.id;
        dynasty.scheduleMessageId = message.id;
        const dbForPanel = loadDatabase();
        const storedDynasty = dbForPanel.dynasties.find(item => String(item.name).toLowerCase() === String(dynasty.name).toLowerCase() && (!dynasty.guildId || item.guildId === dynasty.guildId));
        if (storedDynasty) { storedDynasty.scheduleChannelId = channel.id; storedDynasty.scheduleMessageId = message.id; saveDatabase(dbForPanel); }
        return true;
    } catch (error) { console.error(`Could not refresh schedule readiness for ${dynasty.name}:`, error); return false; }
}

async function handleReadinessButton(interaction) {
    const parsed = parseReadinessCustomId(interaction.customId);
    if (!parsed) return interaction.reply({ content: '❌ This readiness button is invalid or outdated. Please use the current Schedule panel.', ephemeral: true });
    const { name, ready: requestedStatus } = parsed;
    const database = loadDatabase();
    // Dynasty names are not guaranteed globally unique; prefer the current server's record.
    const matches = database.dynasties.filter(item => String(item.name).toLowerCase() === name.toLowerCase());
    const dynasty = matches.find(item => item.guildId && item.guildId === interaction.guildId) || (matches.length === 1 ? matches[0] : null);
    if (!dynasty) return interaction.reply({ content: '❌ This dynasty could not be found.', ephemeral: true });
    if (!(dynasty.coaches || []).some(coach => coach.userId === interaction.user.id)) {
        return interaction.reply({ content: '❌ You must be registered as a coach in this dynasty to update readiness.', ephemeral: true });
    }
    if (!dynasty.advanceReadiness) dynasty.advanceReadiness = {};
    dynasty.advanceReadiness[interaction.user.id] = { ready: requestedStatus, updatedAt: new Date().toISOString() };
    saveDatabase(database);
    await interaction.deferUpdate();
    await refreshSchedulePanel(interaction.client, dynasty);
}

async function refreshDashboard(interaction, dynasty) {
    if (!dynasty.dashboardChannelId || !dynasty.dashboardMessageId) return;
    try {
        const channel = await interaction.client.channels.fetch(dynasty.dashboardChannelId);
        const message = await channel.messages.fetch(dynasty.dashboardMessageId);
        await message.edit({ content: '', embeds: [buildDashboardEmbed(dynasty)], components: buildDashboardComponents(dynasty), allowedMentions: { parse: [] } });
    } catch (error) {
        console.error(`Could not refresh dashboard for ${dynasty.name}:`, error);
    }
}

function requireManagerForDynasty(interaction, dynasty, action = `change **${dynasty.name}**`) {
    if (!canManageDynasty(interaction, dynasty)) {
        interaction.reply({
            content: `❌ You do not have permission to ${action}. Required Discord role: **${MANAGEMENT_ROLES.join('**, **')}**.`,
            ephemeral: true
        });
        return false;
    }
    return true;
}

function getTargetDynasty(database, interaction) {
    const active = database.dynasties.filter(d => d.status === 'active');
    const commissionerDynasties = active.filter(d => d.commissionerId === interaction.user.id);
    if (commissionerDynasties.length === 1) return commissionerDynasties[0];
    if (active.length === 1) return active[0];
    return null;
}

module.exports = {
    refreshSchedulePanel,
    handleReadinessButton,
    data: new SlashCommandBuilder()
        .setName('dynasty').setDescription('Manage BLACKLINE dynasties.')
        .addSubcommand(s => s.setName('create').setDescription('Create a dynasty.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('game').setDescription('Game.').setRequired(true).addChoices(
                { name: 'NCAA 27', value: 'ncaa' }, { name: 'Madden', value: 'madden' }, { name: 'NBA 2K', value: '2k' }
            )))
        .addSubcommand(s => s.setName('join').setDescription('Join a dynasty as a coach.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('timezone').setDescription('Your IANA timezone, e.g. America/New_York.').setRequired(false)))
        .addSubcommand(s => s.setName('leave').setDescription('Leave a dynasty.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true)))
        .addSubcommand(s => s.setName('coach-add').setDescription('Add a Discord user as a coach.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addUserOption(o => o.setName('user').setDescription('Select the Discord member to add.').setRequired(true)))
        .addSubcommand(s => s.setName('coach-remove').setDescription('Remove a Discord user as a coach.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addUserOption(o => o.setName('user').setDescription('Select the Discord member to remove.').setRequired(true)))
        .addSubcommand(s => s.setName('role').setDescription('Set the Discord role used for this dynasty.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addRoleOption(o => o.setName('role').setDescription('Discord role for members of this dynasty.').setRequired(true)))
        .addSubcommand(s => s.setName('members').setDescription('See who has joined a dynasty.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true)))
        .addSubcommand(s => s.setName('connection').setDescription('Set the league username and password.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('username').setDescription('League username.').setRequired(true))
            .addStringOption(o => o.setName('password').setDescription('League password.').setRequired(true)))
        .addSubcommand(s => s.setName('rules').setDescription('Set the quick info/rules on the panel.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('rules').setDescription('Separate rules with | characters.').setRequired(true)))
        .addSubcommand(s => s.setName('gotw').setDescription('Set the Game of the Week.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('game').setDescription('Game of the Week text.').setRequired(true)))
        .addSubcommand(s => s.setName('champion').setDescription('Set the defending champion.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('team').setDescription('Defending champion.').setRequired(true)))
        .addSubcommand(s => s.setName('rankings').setDescription('Set the CFP Top 4.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('top4').setDescription('Four teams separated by | characters.').setRequired(true)))
        .addSubcommand(s => s.setName('bubble').setDescription('Set the bubble teams.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('teams').setDescription('Teams separated by | characters.').setRequired(true)))
        .addSubcommand(s => s.setName('advance-timezone').setDescription('Set the dynasty timezone used for the actual M/W/F 9 PM automatic advance.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addStringOption(o => o.setName('timezone').setDescription('IANA timezone, e.g. America/New_York.').setRequired(true)))
        .addSubcommand(s => s.setName('timezone').setDescription('Set your timezone for local 9 PM advance notifications.')
            .addStringOption(o => o.setName('timezone').setDescription('IANA timezone, e.g. America/Chicago.').setRequired(true)))
        .addSubcommand(s => s.setName('ready').setDescription('Mark yourself ready or not ready for the next advance.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
            .addBooleanOption(o => o.setName('status').setDescription('Ready for the next advance?').setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const database = loadDatabase();

        if (subcommand === 'create') {
            if (!requireManager(interaction, 'create a dynasty')) return;
            const name = interaction.options.getString('name').trim();
            const game = interaction.options.getString('game');
            const categoryId = interaction.channel?.parentId;
            if (!categoryId) return interaction.reply({ content: '❌ Run this command in the league category where you want the new league created (for example, in that category’s League Hub channel).', ephemeral: true });
            const channel = findDashboardChannel(interaction.guild, categoryId);
            if (!channel) return interaction.reply({ content: `❌ I could not find **${DASHBOARD_CHANNEL_NAME}** in this category. Please run /dynasty create from a text channel inside the intended league category.`, ephemeral: true });
            if (findDynasty(database, name)) return interaction.reply({ content: `❌ A dynasty named **${name}** already exists.`, ephemeral: true });

            const dynasty = {
                id: `dynasty-${Date.now()}`, name, game, platform: 'crossplay', guildId: interaction.guild.id, commissionerId: interaction.user.id,
                commissionerTag: interaction.user.tag, categoryId, season: 1, seasonYear: 2026, currentWeek: 0,
                currentPhase: 'offseason', currentPhaseLabel: 'Off-Season', status: 'active', defendingChampion: null,
                nextAdvance: 'Automatic: Monday, Wednesday & Friday at 9:00 PM local time', coaches: [], coachCount: 0,
                maxCoaches: 32, gameOfTheWeek: 'Not Set', rankings: [], bubbleTeams: [],
                rules: [], connection: { username: 'Not Set', password: 'Not Set' },
                settings: { quarters: 'Not Set', advance: 'Mon / Wed / Fri at 9 PM local', acceleratedClock: 'Not Set' },
                teams: [], teamSelections: [], teamEmojis: {}, teamChannelId: null, teamMessageId: null, discordRoleId: null, discordRoleName: null, dashboardChannelId: channel.id, dashboardMessageId: null, automaticAdvance: true,
                createdAt: new Date().toISOString()
            };
            database.dynasties.push(dynasty);
            let message;
            try {
                message = await channel.send({ embeds: [buildDashboardEmbed(dynasty)], components: buildDashboardComponents(dynasty), allowedMentions: { parse: [] } });
                dynasty.dashboardMessageId = message.id;
                saveDatabase(database);
            } catch (error) {
                database.dynasties.pop();
                try { if (message) await message.delete(); } catch (_) {}
                console.error(error);
                return interaction.reply({ content: '❌ Could not create the permanent dashboard.', ephemeral: true });
            }
            await updateAllDashboards(interaction.client);
            await refreshSchedulePanel(interaction.client, dynasty);
            return interaction.reply({ content: `🏆 **${name}** created.\n📅 Season 1 • 2026 • Off-Season\n👥 Coaches: **0/32**\n✅ The dashboard will be edited in place.`, ephemeral: true });
        }

        if (subcommand === 'advance-timezone') {
            const name = interaction.options.getString('name');
            const dynasty = findDynasty(database, name);
            if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });
            if (!requireManagerForDynasty(interaction, dynasty)) return;
            const timezone = interaction.options.getString('timezone').trim();
            try { Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch (_) { return interaction.reply({ content: '❌ Invalid IANA timezone.', ephemeral: true }); }
            dynasty.advanceTimezone = timezone;
            saveDatabase(database);
            await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: `✅ **${dynasty.name}** automatic advances now use **${timezone}** at 9:00 PM Monday, Wednesday and Friday.`, ephemeral: true });
        }

        if (subcommand === 'ready') {
            const name = interaction.options.getString('name').trim();
            const dynasty = findDynasty(database, name);
            if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });
            const coach = dynasty.coaches.find(c => c.userId === interaction.user.id);
            if (!coach && dynasty.commissionerId !== interaction.user.id) return interaction.reply({ content: '❌ You must be a coach or the commissioner of this dynasty to update readiness.', ephemeral: true });
            if (!dynasty.advanceReadiness || typeof dynasty.advanceReadiness !== 'object') dynasty.advanceReadiness = {};
            dynasty.advanceReadiness[interaction.user.id] = { ready: interaction.options.getBoolean('status'), updatedAt: new Date().toISOString() };
            saveDatabase(database);
            await refreshSchedulePanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ Your readiness for **${dynasty.name}** is now **${dynasty.advanceReadiness[interaction.user.id].ready ? 'READY' : 'NOT READY'}**. See 📅・schedule for the live status.`, ephemeral: true });
        }

        if (subcommand === 'timezone') {
            const timezone = interaction.options.getString('timezone').trim();
            try { Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch (_) {
                return interaction.reply({ content: '❌ Invalid IANA timezone. Example: `America/New_York`.', ephemeral: true });
            }
            const dynasties = database.dynasties.filter(d => d.status === 'active' && (
                d.coaches.some(c => c.userId === interaction.user.id) || d.commissionerId === interaction.user.id
            ));
            if (!dynasties.length) return interaction.reply({ content: '❌ You are not currently part of a dynasty. If you created the dynasty, you can still set your timezone because the bot now recognizes you as its commissioner.', ephemeral: true });
            for (const dynasty of dynasties) {
                if (dynasty.coaches.some(c => c.userId === interaction.user.id)) setCoachTimezone(dynasty, interaction.user.id, timezone);
                else {
                    dynasty.commissionerTimezone = timezone;
                }
            }
            saveDatabase(database);
            return interaction.reply({ content: `✅ Your timezone is now **${timezone}** for local 9 PM scheduling.`, ephemeral: true });
        }

        let name = interaction.options.getString('name');
        let dynasty;
        name = name?.trim();
        dynasty = findDynasty(database, name);
        if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });

        if (subcommand === 'members') {
            if (!requireManagerForDynasty(interaction, dynasty, `view the members of **${dynasty.name}**`)) return;
            if (!dynasty.coaches.length) return interaction.reply({ content: `👥 **${dynasty.name}** has no coaches yet.`, ephemeral: true });
            const members = dynasty.coaches.map((coach, index) => `${index + 1}. <@${coach.userId}> — \`${coach.username || coach.userId}\``).join('\n');
            return interaction.reply({ content: `👥 **${dynasty.name} — ${formatCoachCount(dynasty)}**\n\n${members}`, ephemeral: true });
        }

        if (subcommand === 'join') {
            const timezone = interaction.options.getString('timezone') || database.settings.defaultTimezone;
            try { Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); } catch (_) {
                return interaction.reply({ content: '❌ Invalid IANA timezone.', ephemeral: true });
            }
            const result = addCoach(dynasty, interaction.user, timezone);
            if (!result.success) return interaction.reply({ content: result.reason === 'full' ? `❌ **${dynasty.name}** is full.` : '❌ You are already registered.', ephemeral: true });
            saveDatabase(database);
            const roleUpdated = await interaction.client.blackline.setDynastyRole(interaction.guild, dynasty, interaction.user.id, true);
            await refreshDashboard(interaction, dynasty);
            await refreshSchedulePanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ You joined **${dynasty.name}**.\n👥 Coaches: **${formatCoachCount(dynasty)}**`, ephemeral: true });
        }

        if (subcommand === 'leave') {
            const result = removeCoach(dynasty, interaction.user.id);
            if (!result.success) return interaction.reply({ content: `❌ You are not registered in **${dynasty.name}**.`, ephemeral: true });
            saveDatabase(database);
            await interaction.client.blackline.setDynastyRole(interaction.guild, dynasty, interaction.user.id, false);
            await refreshDashboard(interaction, dynasty);
            await refreshSchedulePanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ You left **${dynasty.name}**.\n👥 Coaches: **${formatCoachCount(dynasty)}**`, ephemeral: true });
        }

        if (subcommand === 'role') {
            if (!requireManagerForDynasty(interaction, dynasty, `set the Discord role for **${dynasty.name}**`)) return;
            const role = interaction.options.getRole('role');
            dynasty.discordRoleId = role.id;
            dynasty.discordRoleName = role.name;
            saveDatabase(database);
            return interaction.reply({ content: `✅ **${dynasty.name}** will now use the Discord role ${role}. Members added to this dynasty will receive it.`, ephemeral: true });
        }

        if (subcommand === 'coach-add' || subcommand === 'coach-remove') {
            if (!requireManagerForDynasty(interaction, dynasty, subcommand === 'coach-add' ? 'add users to dynasties' : 'remove users from dynasties')) return;
            const user = interaction.options.getUser('user');
            const result = subcommand === 'coach-add' ? addCoach(dynasty, user) : removeCoach(dynasty, user.id);
            if (!result.success) return interaction.reply({ content: subcommand === 'coach-add' ? (result.reason === 'full' ? `❌ **${dynasty.name}** is full.` : `❌ ${user} is already a coach.`) : `❌ ${user} is not a coach in **${dynasty.name}**.`, ephemeral: true });
            saveDatabase(database);
            const roleUpdated = await interaction.client.blackline.setDynastyRole(interaction.guild, dynasty, user.id, subcommand === 'coach-add');
            await refreshDashboard(interaction, dynasty);
            await refreshSchedulePanel(interaction.client, dynasty);
            const roleMessage = roleUpdated
                ? ''
                : '\n⚠️ The dynasty was updated, but Discord could not update its Discord role. Set a dynasty role with **/dynasty role** and make sure the bot has **Manage Roles** and its highest role is above that role.';
            return interaction.reply({ content: `✅ ${user} ${subcommand === 'coach-add' ? 'added to' : 'removed from'} **${dynasty.name}**.\n👥 Coaches: **${formatCoachCount(dynasty)}**${roleMessage}`, ephemeral: true });
        }

        if (!requireManagerForDynasty(interaction, dynasty)) return;

        if (subcommand === 'connection') {
            dynasty.connection = { username: interaction.options.getString('username'), password: interaction.options.getString('password') };
            saveDatabase(database); await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: '✅ League connection information updated on the dashboard.', ephemeral: true });
        }

        if (subcommand === 'rules') {
            dynasty.rules = interaction.options.getString('rules').split('|').map(x => x.trim()).filter(Boolean);
            saveDatabase(database); await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: '✅ Quick Info / Rules updated on the existing dashboard.', ephemeral: true });
        }

        if (subcommand === 'gotw') {
            dynasty.gameOfTheWeek = interaction.options.getString('game');
            saveDatabase(database); await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: '✅ Game of the Week updated on the existing dashboard.', ephemeral: true });
        }

        if (subcommand === 'champion') {
            dynasty.defendingChampion = interaction.options.getString('team');
            saveDatabase(database); await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: '✅ Defending Champion updated on the existing dashboard.', ephemeral: true });
        }

        if (subcommand === 'rankings') {
            dynasty.rankings = interaction.options.getString('top4').split('|').map(x => x.trim()).filter(Boolean).slice(0, 4);
            saveDatabase(database); await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: '✅ CFP Top 4 updated on the existing dashboard.', ephemeral: true });
        }

        if (subcommand === 'bubble') {
            dynasty.bubbleTeams = interaction.options.getString('teams').split('|').map(x => x.trim()).filter(Boolean);
            saveDatabase(database); await refreshDashboard(interaction, dynasty);
            return interaction.reply({ content: '✅ Bubble teams updated on the existing dashboard.', ephemeral: true });
        }

    }
};
