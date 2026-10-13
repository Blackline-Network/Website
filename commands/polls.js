const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadDatabase, saveDatabase, findDynasty } = require('../utils/league');
const { appendAuditEntry } = require('../utils/operations');
const { parseChoices, createPoll, castVote, summarizePoll } = require('../utils/leaguePolls');
const { configuredManagerRoles, hasManagerAccess } = require('../utils/accessControl');
const MANAGER_ROLES = configuredManagerRoles();

function buildPollEmbed(dynasty, poll) {
    const { counts, totalVotes } = summarizePoll(poll);
    const lines = poll.choices.map((choice, i) => `**${i + 1}. ${choice}** — ${counts[i]} vote${counts[i] === 1 ? '' : 's'}`).join('\n');
    return new EmbedBuilder().setColor(poll.closed ? 0x747f8d : 0x243447)
        .setTitle(`🗳️ ${poll.title}`)
        .setDescription(`${lines}\n\n**${totalVotes}** vote${totalVotes === 1 ? '' : 's'} · ${poll.closed ? 'Poll closed' : 'Voting open'}\nEach member has one vote and can change it until the poll closes.`)
        .setFooter({ text: `${dynasty.name} · Poll ${poll.id}` });
}
function buildPollComponents(poll) {
    const rows = [];
    for (let start = 0; start < poll.choices.length; start += 5) {
        const row = new ActionRowBuilder();
        poll.choices.slice(start, start + 5).forEach((choice, offset) => row.addComponents(new ButtonBuilder()
            .setCustomId(`blackline_poll_vote:${poll.id}:${start + offset}`)
            .setLabel(choice.slice(0, 80)).setStyle(ButtonStyle.Primary).setDisabled(!!poll.closed)));
        rows.push(row);
    }
    return rows;
}
async function handlePollButton(interaction) {
    const match = /^blackline_poll_vote:([a-f0-9]+):(\d+)$/.exec(interaction.customId);
    if (!match) return false;
    const database = loadDatabase();
    const dynasty = (database.dynasties || []).find(d => (d.leaguePolls || []).some(p => p.id === match[1]));
    const poll = dynasty?.leaguePolls?.find(p => p.id === match[1]);
    if (!poll) { await interaction.reply({ content: 'This poll is no longer available.', ephemeral: true }); return true; }
    if (poll.channelId && interaction.channelId !== poll.channelId) { await interaction.reply({ content: 'Please vote using the poll in its original channel.', ephemeral: true }); return true; }
    const result = castVote(poll, interaction.user.id, Number(match[2]));
    if (!result.ok) { await interaction.reply({ content: result.reason === 'closed' ? 'This poll is closed.' : 'That poll choice is invalid.', ephemeral: true }); return true; }
    saveDatabase(database);
    await interaction.update({ embeds: [buildPollEmbed(dynasty, poll)], components: buildPollComponents(poll) });
    return true;
}

module.exports = {
  data: new SlashCommandBuilder().setName('poll').setDescription('Staff: manage interactive BLACKLINE league polls.')
    .addSubcommand(s => s.setName('create').setDescription('Publish a public poll in the existing Competition Center.')
      .addStringOption(o => o.setName('name').setDescription('Exact dynasty name').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Poll question or title').setRequired(true).setMaxLength(180))
      .addStringOption(o => o.setName('choices').setDescription('2–5 choices separated by |').setRequired(true).setMaxLength(400))),
  async execute(interaction) {
    if (!hasManagerAccess(interaction, MANAGER_ROLES)) return interaction.reply({ content: `🔒 Poll creation requires one of these roles: **${MANAGER_ROLES.join('**, **')}**.`, ephemeral: true });
    const database = loadDatabase();
    const name = interaction.options.getString('name', true).trim();
    const dynasty = findDynasty(database, name);
    if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ Active dynasty **${name}** was not found.`, ephemeral: true });
    const parsed = parseChoices(interaction.options.getString('choices', true));
    if (parsed.error) return interaction.reply({ content: `❌ ${parsed.error}`, ephemeral: true });
    if (!dynasty.competitionChannelId) return interaction.reply({ content: 'The Competition Center must be set up first. Ask a league manager to run `/league panel` in the competition channel.', ephemeral: true });
    const created = createPoll({ title: interaction.options.getString('title', true), choices: parsed.choices, creatorId: interaction.user.id });
    if (created.error) return interaction.reply({ content: `❌ ${created.error}`, ephemeral: true });
    const channel = await interaction.client.channels.fetch(dynasty.competitionChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: '❌ The saved Competition Center channel is unavailable. Refresh or recreate that existing panel, then try again.', ephemeral: true });
    const poll = created.poll;
    const message = await channel.send({ embeds: [buildPollEmbed(dynasty, poll)], components: buildPollComponents(poll) });
    poll.messageId = message.id; poll.channelId = channel.id;
    dynasty.leaguePolls ||= []; dynasty.leaguePolls.push(poll);
    if (dynasty.leaguePolls.length > 100) dynasty.leaguePolls = dynasty.leaguePolls.slice(-100);
    appendAuditEntry(dynasty, { action: 'league-poll-created', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { pollId: poll.id, title: poll.title, choices: poll.choices.length } });
    saveDatabase(database);
    return interaction.reply({ content: `✅ Published **${poll.title}** in the Competition Center. Members can vote or change their vote using the buttons.`, ephemeral: true });
  },
  handlePollButton
};
