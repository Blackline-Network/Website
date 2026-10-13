const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getTeamEmoji, getTeamSelections } = require('./teams');
const gameNames = { ncaa: 'NCAA 27', madden: 'MADDEN', '2k': 'NBA 2K' };

function getTimezoneLabel(timezone) {
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'short'
        }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value || timezone;
    } catch (_) {
        return timezone || 'Local';
    }
}

function getNextAdvanceDate(timezone, from = new Date()) {
    const days = new Set(['Mon', 'Wed', 'Fri']);
    const start = new Date(from);
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
    for (let i = 0; i < 8 * 24 * 60; i++) {
        const candidate = new Date(start.getTime() + i * 60_000);
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(candidate);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        if (days.has(values.weekday) && Number(values.hour) === 21 && Number(values.minute) === 0) return candidate;
    }
    return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function buildDashboardEmbed(dynasty) {
    const { getPhaseLabel, formatCoachCount } = require('./league');
    const timezone = dynasty.advanceTimezone || 'America/New_York';
    const nextAdvance = getNextAdvanceDate(timezone);
    const nextAdvanceUnix = Math.floor(nextAdvance.getTime() / 1000);
    const rankings = dynasty.rankings?.length
        ? dynasty.rankings.slice(0, 4).map((team, i) => `${i + 1}. ${team}`).join('\n')
        : 'Not Set';
    const bubble = dynasty.bubbleTeams?.length
        ? dynasty.bubbleTeams.join('\n')
        : 'Not Set';
    const rules = dynasty.rules?.length
        ? dynasty.rules.map((rule, i) => `${i + 1}. ${rule}`).join('\n')
        : 'Not Set';
    const teamSelections = getTeamSelections(dynasty);
    const selectedTeams = teamSelections.length
        ? teamSelections.slice().sort((a, b) => a.team.localeCompare(b.team, undefined, { sensitivity: 'base' })).map(selection => `${getTeamEmoji(dynasty, selection.team)} **${selection.team}** — <@${selection.userId}>`).join('\n')
        : 'No teams selected yet.';

    return new EmbedBuilder()
        .setTitle(`🏈 BLACKLINE — ${dynasty.name}`)
        .setDescription(`**${gameNames[dynasty.game] || dynasty.game.toUpperCase()}**  •  Season ${dynasty.season}  •  ${dynasty.seasonYear}  •  Cross-Play`)
        .addFields(
            { name: '📅 CURRENT WEEK', value: `**${getPhaseLabel(dynasty)}**`, inline: true },
            { name: '⏰ NEXT ADVANCE', value: `<t:${nextAdvanceUnix}:F>\n<t:${nextAdvanceUnix}:R>`, inline: true },
            { name: '👥 LEAGUE', value: `**${formatCoachCount(dynasty)}**`, inline: true },
            { name: '🏆 DEFENDING CHAMPION', value: dynasty.defendingChampion || 'Not Set', inline: false },
            { name: '🔥 GAME OF THE WEEK', value: dynasty.gameOfTheWeek || 'Not Set', inline: false },
            { name: '🏈 TEAM SELECTIONS', value: selectedTeams.slice(0, 1024), inline: false },
            { name: '🏆 CFP TOP 4', value: rankings, inline: true },
            { name: '⚠️ BUBBLE', value: bubble, inline: true },
            { name: '🔐 LEAGUE CONNECTION', value: `**Username:** ${dynasty.connection?.username || 'Not Set'}\n**Password:** ${dynasty.connection?.password || 'Not Set'}`, inline: false },
            { name: '📋 QUICK INFO / RULES', value: rules, inline: false },
            { name: '🟢 STATUS', value: `League Active  •  ${getPhaseLabel(dynasty)} Open`, inline: false }
        )
        .setFooter({ text: 'BLACKLINE • Live Dynasty League' })
        .setTimestamp();
}

function buildDashboardComponents(dynasty) {
    const links = [
        ['scheduleChannelId', 'scheduleMessageId', '📅 Schedule'],
        ['teamChannelId', 'teamMessageId', '🏈 Team Selection'],
        ['competitionChannelId', 'competitionMessageId', '🏆 Competition'],
        ['coachCenterChannelId', 'coachCenterMessageId', '🧢 Coach Center'],
        ['historyChannelId', 'historyMessageId', '📚 League History']
    ];
    const buttons = links.filter(([channelKey, messageKey]) => dynasty[channelKey] && dynasty[messageKey] && dynasty.guildId)
        .map(([channelKey, messageKey, label]) => new ButtonBuilder()
            .setLabel(label)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${dynasty.guildId}/${dynasty[channelKey]}/${dynasty[messageKey]}`));
    return buttons.length ? [new ActionRowBuilder().addComponents(...buttons)] : [];
}

module.exports = { buildDashboardEmbed, buildDashboardComponents, getNextAdvanceDate };
