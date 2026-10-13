const { recoverPanelTarget, persistPanelReferences } = require('../utils/panelRecovery');
const {
  SlashCommandBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { loadDatabase, saveDatabase, findDynasty, updateDashboardMessage } = require('../utils/league');
const { getTeamsForDynasty, getTeamEmoji, parseDiscordEmoji, getTeamSelections, getCoachTeam, claimTeam, releaseTeam, resolveGuildEmoji } = require('../utils/teams');
const { diagnoseTeamSelection } = require('../utils/teamSelectionDiagnostics');
const { planTeamSelectionRepair, applyTeamSelectionRepair } = require('../utils/teamSelectionRepair');
const { diagnosePanelFailure } = require('../utils/panelDiagnostics');
const { appendTeamClaimAudit, getTeamClaimAudit } = require('../utils/teamClaimAudit');
const { notifyTeamClaimChange } = require('../utils/teamClaimNotifications');

const TEAM_CHANNEL_NAME = '🏈・teams';
const MANAGEMENT_ROLES = [...(process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager').split(',').map(x => x.trim()).filter(Boolean), ...(process.env.BL_STAFF_ROLES || 'BL Staff').split(',').map(x => x.trim()).filter(Boolean)];
const PAGE_SIZE = 12;

function hasManagementRole(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = interaction.member?.roles?.cache;
  return !!roles && roles.some(role => MANAGEMENT_ROLES.includes(role.name) || MANAGEMENT_ROLES.includes(role.id));
}
function findTeamChannel(guild, dynasty) { return guild.channels.cache.find(c => c.name === TEAM_CHANNEL_NAME && c.type === ChannelType.GuildText && (!dynasty?.categoryId || c.parentId === dynasty.categoryId)); }

// Keep team claims/releases successful even if a Discord panel edit temporarily fails.
// Each projection is attempted independently so one failure never prevents the other refresh.
async function syncTeamPanels(client, dynasty, db, { page = 0, logger = console } = {}) {
  const results = { teamPanel: false, leagueHub: false };
  try { results.teamPanel = await refreshPanel(client, dynasty, page); }
  catch (error) { logger.error?.(`Team panel sync failed for ${dynasty.name}:`, error); }
  try { results.leagueHub = await updateDashboardMessage(client, dynasty, db); }
  catch (error) { logger.error?.(`League Hub sync failed for ${dynasty.name}:`, error); }
  if (!results.teamPanel || !results.leagueHub) {
    logger.warn?.(`Team claim state saved for ${dynasty.name}; panel sync status: team=${results.teamPanel}, hub=${results.leagueHub}. Use /panels refresh if needed.`);
  }
  return results;
}
function normalizeEmojiName(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^bl/, ''); }
function teamEmojiAliases(team) {
  const normalized = normalizeEmojiName(team);
  const shortNames = {
    'miamiuniversity': ['miamioh', 'miamiuniversityohio'],
    'miami': ['miamifl', 'miamihurricanes'],
    'usc': ['southerncalifornia'], 'uconn': ['connecticut'],
    'olemiss': ['mississippi'], 'lsu': ['louisianastate'],
    'smu': ['southernmethodist'], 'ucf': ['centralflorida'],
    'usf': ['southflorida'], 'uab': ['alabamabirmingham'],
    'ulmonroe': ['louisianamonroe'], 'hawaii': ['hawaii'],
    'texasam': ['texasamaggies'], 'ncstate': ['northcarolinastate'],
    'pittsburgh': ['pitt'], 'appalachianstate': ['appstate'],
    'southernmississippi': ['southernmiss'], 'middletennessee': ['mtsu'],
    'akron': ['akronzips', 'zips', 'akronuniversity'],
    'georgia': ['georgiabulldogs', 'georgiadawgs', 'uga', 'georgiabulldog'],
    'floridastate': ['fsu', 'seminoles'],
    'michigan': ['michiganwolverines', 'wolverines'],
    'notredame': ['nd', 'fightingirish'],
    'ohiostate': ['theohiostate', 'ohiostatebuckeyes', 'buckeyes']
  };
  return new Set([normalized, ...((shortNames[normalized] || []))].map(normalizeEmojiName));
}
function findNamedTeamEmoji(emojiManager, team) {
  if (!emojiManager?.cache) return null;
  const aliases = teamEmojiAliases(team);
  // Prefer exact normalized names, then common school-name aliases.
  return emojiManager.cache.find(e => aliases.has(normalizeEmojiName(e.name))) || null;
}
function emojiMarkup(emoji) { return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : null; }

// Keep the League Hub's saved emoji map in sync with the logos that the team
// selection panel can already resolve by name. Preserve any manager-assigned
// emoji and only fill missing mappings.
function syncNamedTeamEmojiMappings(dynasty, guild, client) {
  if (!dynasty.teamEmojis || typeof dynasty.teamEmojis !== 'object') dynasty.teamEmojis = {};
  let changed = false;
  for (const team of getTeamsForDynasty(dynasty)) {
    // A generic football glyph is only a display fallback, not a real team-logo assignment.
    if (dynasty.teamEmojis[team] && dynasty.teamEmojis[team] !== '🏈') continue;
    const found = findNamedTeamEmoji(guild?.emojis, team) || findNamedTeamEmoji(client?.application?.emojis, team);
    const markup = emojiMarkup(found);
    if (markup) { dynasty.teamEmojis[team] = markup; changed = true; }
  }
  return changed;
}
// Canonical team lookup labels intentionally use the user's exact format,
// e.g. :NotreDame: and :FloridaState:. These labels are aliases/keys; Discord
// itself does not permit spaces in a custom emoji's underlying name, so when
// importing a logo we convert the label to a valid Discord name.
function teamEmojiLabel(team) {
  return `:${String(team || '').replace(/[^A-Za-z0-9]/g, '')}:`;
}
function teamEmojiName(team) {
  const words = String(team || '').match(/[A-Za-z0-9]+/g) || [];
  return (words.join('') || 'TeamLogo').slice(0, 32);
}
function managerOnly(interaction, action) {
  if (hasManagementRole(interaction)) return true;
  interaction.reply({ content: `❌ You do not have permission to ${action}.`, ephemeral: true });
  return false;
}
function dynastyFrom(interaction, db) {
  const name = interaction.options?.getString('name');
  return name ? findDynasty(db, name) : null;
}
async function teamEmojiOption(client, guild, dynasty, team) {
  const stored = dynasty?.teamEmojis?.[team];
  // Automatically match an existing server emoji named after the school (e.g. :Alabama: or :North_Dakota_State:).
  if (!stored) {
    const found = findNamedTeamEmoji(guild?.emojis, team) || findNamedTeamEmoji(client?.application?.emojis, team);
    if (found) return { id: found.id, name: found.name, animated: found.animated };
    return undefined;
  }
  const parsed = parseDiscordEmoji(stored);
  if (!parsed) return undefined;

  // First resolve emojis that live in the current guild.
  const guildEmoji = resolveGuildEmoji(guild, stored);
  if (guildEmoji && !guildEmoji.external) return guildEmoji;

  // Imported team logos are application-owned emojis. Discord select-menu
  // options accept the application's emoji ID/name/animated fields directly.
  // buildPanel prefetches application emojis once per render to avoid a network
  // request for every team option.
  try {
    const manager = client?.application?.emojis;
    if (manager) {
      const appEmoji = parsed.id
        ? manager.cache.get(parsed.id)
        : manager.cache.find(e => e.name === parsed.name);
      if (appEmoji) return { id: appEmoji.id, name: appEmoji.name, animated: appEmoji.animated };
    }
  } catch (error) {
    console.error(`Could not resolve application emoji for ${team}:`, error);
  }

  // Fall back to the stored partial emoji when Discord can resolve it.
  return (parsed.id && parsed.name) ? { id: parsed.id, name: parsed.name, animated: !!parsed.animated } : undefined;
}
function teamStatusLines(dynasty, teams) {
  const taken = new Map(getTeamSelections(dynasty).map(x => [x.team, x]));
  const available = teams.filter(t => !taken.has(t));
  const unavailable = teams.filter(t => taken.has(t));
  const format = (team) => `${getTeamEmoji(dynasty, team)} ${team}`;
  return { available, unavailable, availableText: available.length ? available.map(format).join('\n') : 'None', unavailableText: unavailable.length ? unavailable.map(t => `${format(t)} — <@${taken.get(t).userId}>`).join('\n') : 'None' };
}
async function buildPanel(dynasty, page = 0, guild = null, client = null) {
  const teams = getTeamsForDynasty(dynasty);
  const totalPages = Math.max(1, Math.ceil(teams.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageTeams = teams.slice(start, start + PAGE_SIZE);
  // Fetch application emojis once per panel build, not once per team. Doing
  // this inside teamEmojiOption could trigger 25 serial API calls and exceed
  // Discord's three-second component interaction acknowledgement deadline.
  try {
    if (client?.application?.emojis) await client.application.emojis.fetch();
  } catch (error) {
    console.error('Could not fetch BLACKLINE application emojis:', error);
  }
  const taken = new Map(getTeamSelections(dynasty).map(x => [x.team, x]));
  const status = teamStatusLines(dynasty, teams);
  // The visible AVAILABLE/UNAVAILABLE lists must use the same page slice as
  // the dropdown. Previously only the dropdown paginated, so the long list
  // stayed stuck on the first page (and was truncated at Discord's field limit).
  const pageTaken = new Map(pageTeams.filter(t => taken.has(t)).map(t => [t, taken.get(t)]));
  const pageAvailable = pageTeams.filter(t => !taken.has(t));
  const pageUnavailable = pageTeams.filter(t => taken.has(t));
  const displayEmoji = (team) => {
    const stored = dynasty?.teamEmojis?.[team];
    if (stored) return stored;
    const found = findNamedTeamEmoji(guild?.emojis, team) || findNamedTeamEmoji(client?.application?.emojis, team);
    return found ? emojiMarkup(found) : '🏈';
  };
  const format = (team) => `${displayEmoji(team)} ${team}`;
  const pageAvailableText = pageAvailable.length ? pageAvailable.map(format).join('\n') : 'None on this page';
  const pageUnavailableText = pageUnavailable.length ? pageUnavailable.map(t => `${format(t)} — <@${pageTaken.get(t).userId}>`).join('\n') : 'None on this page';

  const embed = new EmbedBuilder()
    .setTitle(`🏈 ${dynasty.name} — Team Selection`)
    .setDescription(`Select your team below. **Taken teams cannot be selected.**\n\nPage **${safePage + 1}/${totalPages}** • Showing ${start + 1}–${Math.min(start + pageTeams.length, teams.length)} of ${teams.length} teams • ${status.available.length} available total • ${status.unavailable.length} taken total`)
    .addFields(
      { name: `🟢 AVAILABLE (${pageAvailable.length} on this page)`, value: pageAvailableText.slice(0, 1024), inline: true },
      { name: `🔴 UNAVAILABLE (${pageUnavailable.length} on this page)`, value: pageUnavailableText.slice(0, 1024), inline: true }
    );

  const select = new StringSelectMenuBuilder().setCustomId(`blackline_team_select:${dynasty.id}:${safePage}`).setPlaceholder('🏈 Select an available team...').setMinValues(1).setMaxValues(1);
  for (const team of pageTeams) {
    const option = { label: team.slice(0, 100), value: team, description: taken.has(team) ? `Taken by ${taken.get(team).username || 'another coach'}` : 'Available — click to claim' };
    const emoji = await teamEmojiOption(client, guild, dynasty, team);
    if (emoji) option.emoji = emoji;
    // Discord select options cannot be disabled, so taken teams are intentionally omitted from the selectable list.
    if (!taken.has(team)) select.addOptions(option);
  }
  if (select.options.length === 0) {
    select.addOptions({ label: 'No available teams on this page', value: '__none__', description: 'Use the page buttons to find an available team.' });
  }

  const row = new ActionRowBuilder().addComponents(select);
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blackline_team_nav:${dynasty.id}:prev:${safePage}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
    new ButtonBuilder().setCustomId(`blackline_team_nav:${dynasty.id}:next:${safePage}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder().setCustomId(`blackline_team_refresh:${dynasty.id}:${safePage}`).setLabel('↻ Refresh').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`blackline_team_release:${dynasty.id}`).setLabel('Release Team').setStyle(ButtonStyle.Danger)
  );
  return { embeds: [embed], components: [row, nav] };
}

async function refreshPanel(client, dynasty, page = 0) {
  try {
    const target = await recoverPanelTarget(client, dynasty, {
      channelKey: 'teamChannelId', messageKey: 'teamMessageId',
      channelNamePattern: /teams?|team[-・ ]?selection/i,
      matchesMessage: message => message.embeds?.some(embed => embed.title === `🏈 ${dynasty.name} — Team Selection`)
    });
    if (!target.channel || !target.message) return false;
    await target.message.edit(await buildPanel(dynasty, page, target.channel.guild, client));
    dynasty.teamChannelId = target.channel.id;
    dynasty.teamMessageId = target.message.id;
    if (target.recovered) persistPanelReferences(dynasty, ['teamChannelId', 'teamMessageId']);
    return true;
  } catch (error) { console.error(`Could not refresh team panel for ${dynasty.name}:`, error); return false; }
}

module.exports = {
  refreshPanel,
  data: new SlashCommandBuilder().setName('teams').setDescription('Manage dynasty team selection.')
    .addSubcommand(s => s.setName('setup').setDescription('Create the team selection panel in 🏈・teams.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true)))
    .addSubcommand(s => s.setName('emoji').setDescription('Set a Discord emoji for a team.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
      .addStringOption(o => o.setName('team').setDescription('Exact team name.').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Paste the custom emoji, including one from another server, e.g. <:Alabama:123456789>.').setRequired(true)))
    .addSubcommand(s => s.setName('refresh').setDescription('Refresh the existing team panel.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true)))
    .addSubcommand(s => s.setName('emoji-sync').setDescription('Automatically match team emojis by name; no per-team commands needed.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
      .addBooleanOption(o => o.setName('force').setDescription('Replace existing saved logo assignments when a matching emoji is found.')))
    .addSubcommand(s => s.setName('diagnostics').setDescription('Inspect team claims and team panel references for problems.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true)))
    .addSubcommand(s => s.setName('repair').setDescription('Preview or repair inconsistent team claims; apply must be explicitly enabled.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
      .addBooleanOption(o => o.setName('apply').setDescription('Apply the repair and save changes (default: preview only).')))
    .addSubcommand(s => s.setName('history').setDescription('View recent team claim, release, and repair events.')
      .addStringOption(o => o.setName('name').setDescription('Dynasty name.').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Number of recent events to show (1–25).').setMinValue(1).setMaxValue(25))),

  async execute(interaction) {
    const db = loadDatabase();
    const dynasty = dynastyFrom(interaction, db);
    if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: '❌ Active dynasty not found.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    if (!managerOnly(interaction, `manage team selection for **${dynasty.name}**`)) return;
    const teams = getTeamsForDynasty(dynasty);

    if (sub === 'history') {
      const limit = interaction.options.getInteger('limit') ?? 10;
      const events = getTeamClaimAudit(dynasty, limit);
      if (!events.length) return interaction.reply({ content: `No team claim audit events are saved for **${dynasty.name}** yet. New claims, releases, and repairs will be recorded from this version onward.`, ephemeral: true });
      const lines = events.map(e => {
        const when = e.at ? new Date(e.at).toLocaleString('en-US', { timeZone: 'UTC', hour12: false }) + ' UTC' : 'time unknown';
        const subject = e.team ? ` **${e.team}**` : '';
        const coach = e.username ? ` — ${e.username}` : (e.userId ? ` — user ${e.userId}` : '');
        const actor = e.actorName ? ` (by ${e.actorName})` : '';
        const summary = e.summary ? ` — ${e.summary}` : '';
        return `• \`${when}\` **${e.event}**${subject}${coach}${actor}${summary}`;
      });
      return interaction.reply({ content: `**Team Claim Audit — ${dynasty.name}**\n${lines.join('\n').slice(0, 1850)}\n\nShowing ${events.length} most recent event(s). Up to 100 events are retained per dynasty.`, ephemeral: true });
    }

    if (sub === 'repair') {
      await interaction.deferReply({ ephemeral: true });
      const plan = planTeamSelectionRepair(dynasty);
      const apply = interaction.options.getBoolean('apply') === true;
      const reasons = Object.entries(plan.counts).map(([reason, count]) => `• ${reason.replaceAll('_', ' ')}: ${count}`).join('\n');
      if (!plan.removed.length) {
        return interaction.editReply(`✅ **Team Claim Repair — ${dynasty.name}**\nNo inconsistent team claims were found. Saved claims: **${plan.total}**. No changes were made.`);
      }
      if (!apply) {
        return interaction.editReply(`🧪 **Team Claim Repair Preview — ${dynasty.name}**\nWould keep **${plan.kept.length}** of **${plan.total}** claims and remove **${plan.removed.length}** inconsistent record(s):\n${reasons}\n\nNo changes were saved. To apply this deterministic repair, run **/teams repair** again with **apply: True**. For each conflict, the first valid claim in saved order is retained.`);
      }
      const result = applyTeamSelectionRepair(dynasty, plan);
      const repairSummary = `Removed ${result.removed} inconsistent claim(s); ${result.remaining} remain.`;
      appendTeamClaimAudit(dynasty, 'repair_applied', { summary: repairSummary }, interaction.user);
      saveDatabase(db);
      await notifyTeamClaimChange(interaction.client, dynasty, 'repair_applied', { summary: repairSummary, actorName: interaction.user.username });
      const sync = await syncTeamPanels(interaction.client, dynasty, db, { page: 0 });
      const syncText = `Team panel: ${sync.teamPanel ? 'refreshed' : 'refresh failed'} • League Hub: ${sync.leagueHub ? 'refreshed' : 'refresh failed'}`;
      return interaction.editReply(`🛠️ **Team Claim Repair Applied — ${dynasty.name}**\nRemoved **${result.removed}** inconsistent claim record(s); **${result.remaining}** claim(s) remain.\n${reasons}\n\n${syncText}. Run **/teams diagnostics** to verify the resulting state.`);
    }

    if (sub === 'diagnostics') {
      await interaction.deferReply({ ephemeral: true });
      const report = diagnoseTeamSelection(dynasty);
      let panelStatus = 'Panel references not checked.';
      try { panelStatus = await diagnosePanelFailure(interaction.client, dynasty, 'Team Selection'); }
      catch (error) { panelStatus = `Panel check failed: ${error?.message || 'unknown error'}`; }
      const issueText = report.issues.length ? report.issues.map(issue => `• ${issue}`).join('\n') : 'No saved-state issues detected.';
      const invalidText = report.invalidClaims.length ? `\nInvalid team claims: ${report.invalidClaims.map(x => String(x.team || '(blank)')).slice(0, 12).join(', ')}` : '';
      const duplicateText = report.duplicateTeamClaims.length ? `\nDuplicate team claims: ${[...new Set(report.duplicateTeamClaims.map(x => String(x.team || '(blank)')))].slice(0, 12).join(', ')}` : '';
      const multipleText = report.multipleTeamsPerUser.length ? `\nUsers with multiple teams: ${[...new Set(report.multipleTeamsPerUser.map(x => String(x.userId || '(missing user ID)')))].slice(0, 12).join(', ')}` : '';
      return interaction.editReply({ content: `🔎 **Team Selection Diagnostics — ${dynasty.name}**\nTeams: **${report.totalTeams}** • Claimed: **${report.claimedTeams}** • Available: **${report.availableTeams}** • Claim records: **${report.claimRecords}**\n\n**Saved-state checks**\n${issueText}${invalidText}${duplicateText}${multipleText}\n\n**Discord panel check**\n${panelStatus}\n\nIf a panel reference is missing or stale, run **/panels refresh** first. If the panel message was deleted and cannot be recovered, run **/teams setup** in the correct server. Diagnostics do not modify claims or create messages.`, allowedMentions: { parse: [] } });
    }

    if (sub === 'emoji-sync') {
      await interaction.deferReply({ ephemeral: true });
      const client = interaction.client;
      const application = client.application;
      try { await interaction.guild?.emojis?.fetch(); } catch (error) { console.error('Could not fetch guild emojis:', error); }
      try { await application?.emojis?.fetch(); } catch (error) { console.error('Could not fetch application emojis:', error); }

      // Use actual Discord emoji images only. Names are matched in the user's
      // no-space style (:NotreDame:, :FloridaState:), never ESPN or other catalogs.
      // Preserve manual assignments by default; force=true lets managers repair stale logos.
      const forceEmojiSync = interaction.options.getBoolean('force') === true;
      const emojiManagers = [interaction.guild?.emojis, application?.emojis].filter(Boolean);
      const aliasOverrides = {
        'Miami (OH)': ['MiamiOH', 'MiamiOhio'],
        'Miami': ['MiamiFL', 'MiamiHurricanes'],
        'Ole Miss': ['OleMiss', 'Mississippi'],
        'UConn': ['UConn', 'Connecticut'],
        'LSU': ['LSU', 'LouisianaState'],
        'SMU': ['SMU', 'SouthernMethodist'],
        'UCF': ['UCF', 'CentralFlorida'],
        'USF': ['USF', 'SouthFlorida'],
        'UAB': ['UAB', 'AlabamaBirmingham'],
        'UL Monroe': ['ULMonroe', 'LouisianaMonroe'],
        "Hawai'i": ['Hawaii'],
        'Texas A&M': ['TexasAM', 'TexasAandM'],
        'NC State': ['NCState', 'NorthCarolinaState'],
        'Pittsburgh': ['Pittsburgh', 'Pitt'],
        'Appalachian State': ['AppalachianState', 'AppState'],
        'Southern Mississippi': ['SouthernMississippi', 'SouthernMiss'],
        'Middle Tennessee': ['MiddleTennessee', 'MTSU'],
        'California': ['California', 'Cal'],
        'Coastal Carolina': ['CoastalCarolina', 'CoastalCarolinaChanticleers'],
        'Colorado State': ['ColoradoState', 'ColoradoStateRams'],
        'Ball State': ['BallState'],
        'Akron': ['AkronZips', 'Zips', 'AkronUniversity'],
        'Georgia': ['GeorgiaBulldogs', 'GeorgiaDawgs', 'UGA', 'GeorgiaBulldog'],
        'Florida State': ['FloridaState', 'FSU', 'Seminoles'],
        'Michigan': ['MichiganWolverines', 'Wolverines'],
        'Notre Dame': ['NotreDame', 'FightingIrish'],
        'Ohio State': ['OhioStateBuckeyes', 'Buckeyes', 'TheOhioState']
      };
      const candidates = team => new Set([team, ...(aliasOverrides[team] || [])].map(normalizeEmojiName));
      const findSource = team => {
        const wanted = candidates(team);
        for (const manager of emojiManagers) {
          const found = manager.cache?.find(emoji => wanted.has(normalizeEmojiName(emoji.name)));
          if (found) return found;
        }
        return null;
      };
      if (!dynasty.teamEmojis) dynasty.teamEmojis = {};
      let preserved = 0, matched = 0, imported = 0;
      const missing = [], failed = [];
      for (const team of teams) {
        if (!forceEmojiSync && dynasty.teamEmojis[team] && dynasty.teamEmojis[team] !== '🏈') { preserved++; continue; }
        const sourceEmoji = findSource(team);
        if (!sourceEmoji) { missing.push(team); continue; }
        try {
          let appEmoji = application?.emojis?.cache?.get(sourceEmoji.id);
          if (!appEmoji) {
            const extension = sourceEmoji.animated ? 'gif' : 'png';
            const attachment = `https://cdn.discordapp.com/emojis/${sourceEmoji.id}.${extension}?size=128&quality=lossless`;
            const appName = `bl_${team.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 27)}`;
            // Reuse an app emoji only when its normalized name matches this team.
            appEmoji = application.emojis.cache.find(e => normalizeEmojiName(e.name) === normalizeEmojiName(appName));
            if (!appEmoji) {
              appEmoji = await application.emojis.create({ attachment, name: appName });
              imported++;
            }
          }
          dynasty.teamEmojis[team] = emojiMarkup(appEmoji || sourceEmoji);
          matched++;
        } catch (error) {
          console.error(`Could not sync Discord emoji for ${team}:`, error);
          failed.push(team);
        }
      }
      saveDatabase(db);
      await refreshPanel(client, dynasty, 0);
      await updateDashboardMessage(client, dynasty, db);
      const missingText = missing.length ? `\\n\\n**No matching accessible Discord emoji (${missing.length}):** ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? ', …' : ''}` : '';
      const failedText = failed.length ? `\\n\\n**Could not import (${failed.length}):** ${failed.slice(0, 20).join(', ')}${failed.length > 20 ? ', …' : ''}` : '';
      return interaction.editReply(`✅ Discord emoji sync finished for **${dynasty.name}**. Mode: **${forceEmojiSync ? 'replace matching assignments' : 'preserve existing assignments'}**. Preserved **${preserved}** assignments, matched **${matched}** teams, and imported **${imported}** logos. Names match without spaces, e.g. :NotreDame: and :FloridaState:. No ESPN catalog was used.${missingText}${failedText}`);
    }

    if (sub === 'setup') {
      const channel = findTeamChannel(interaction.guild, dynasty);
      if (!channel) return interaction.reply({ content: `❌ I could not find **${TEAM_CHANNEL_NAME}**.`, ephemeral: true });
      let message;
      if (dynasty.teamMessageId && dynasty.teamChannelId) {
        try { message = await (await interaction.client.channels.fetch(dynasty.teamChannelId)).messages.fetch(dynasty.teamMessageId); } catch (_) { message = null; }
      }
      if (message) await message.edit(await buildPanel(dynasty, 0, interaction.guild, interaction.client));
      else { message = await channel.send(await buildPanel(dynasty, 0, interaction.guild, interaction.client)); dynasty.teamChannelId = channel.id; dynasty.teamMessageId = message.id; }
      if (!dynasty.teamEmojis) dynasty.teamEmojis = {};
      if (!Array.isArray(dynasty.teamSelections)) dynasty.teamSelections = [];
      saveDatabase(db);
      return interaction.reply({ content: `✅ Team selection panel for **${dynasty.name}** is ready in ${channel}.`, ephemeral: true });
    }

    if (sub === 'emoji') {
      const team = interaction.options.getString('team').trim();
      const emojiInput = interaction.options.getString('emoji').trim();
      if (!teams.includes(team)) return interaction.reply({ content: `❌ I could not find **${team}** in this dynasty's team list.`, ephemeral: true });
      const parsed = parseDiscordEmoji(emojiInput);
      if (!parsed?.id || !parsed?.name) {
        return interaction.reply({ content: '❌ I could not read that custom emoji. Paste the full emoji from Discord, like `<:Alabama:123456789>`. ', ephemeral: true });
      }

      // Import the external emoji into BLACKLINE's Discord application.
      // This avoids relying on the emoji belonging to the same server and
      // makes it available to the bot in select-menu components.
      try {
        const application = interaction.client.application;
        await application.emojis.fetch();

        const appName = `bl_${team.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 27)}`;
        let appEmoji = application.emojis.cache.find(e => e.name === appName);
        const extension = parsed.animated ? 'gif' : 'png';
        const cdnUrl = `https://cdn.discordapp.com/emojis/${parsed.id}.${extension}?size=128&quality=lossless`;
        if (appEmoji) {
          // Replacing a team's logo should update the existing application emoji,
          // not silently reuse the old image (e.g. accidentally assigned Ball State).
          appEmoji = await application.emojis.edit(appEmoji.id, { attachment: cdnUrl, name: appName });
        } else {
          appEmoji = await application.emojis.create({ attachment: cdnUrl, name: appName });
        }

        if (!dynasty.teamEmojis) dynasty.teamEmojis = {};
        dynasty.teamEmojis[team] = `<${appEmoji.animated ? 'a' : ''}:${appEmoji.name}:${appEmoji.id}>`;
        saveDatabase(db);
        await refreshPanel(interaction.client, dynasty);
        await updateDashboardMessage(interaction.client, dynasty, db);
        return interaction.reply({ content: `✅ **${team}** now uses ${dynasty.teamEmojis[team]}. I imported the logo into BLACKLINE and updated both the team panel and League Hub.`, ephemeral: true });
      } catch (error) {
        console.error(`Could not import external emoji for ${team}:`, error);
        return interaction.reply({ content: '❌ I could read the emoji, but Discord would not let BLACKLINE import it. Make sure the bot is online and try again. If the error mentions the application emoji limit or image size, that is a Discord limit.', ephemeral: true });
      }
    }

    syncNamedTeamEmojiMappings(dynasty, interaction.guild, interaction.client);
    saveDatabase(db);
    await refreshPanel(interaction.client, dynasty);
    await updateDashboardMessage(interaction.client, dynasty, db);
    return interaction.reply({ content: `✅ **${dynasty.name}** team panel and League Hub refreshed.`, ephemeral: true });
  },

  async handleComponent(interaction) {
    // Acknowledge every team-panel component (buttons AND dropdowns) before disk
    // reads, membership checks, or Discord API work. This must happen within
    // Discord's interaction deadline; deferUpdate preserves the existing panel.
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && !interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    const respondPrivately = (payload) => interaction.followUp({ ...payload, ephemeral: true });
    const db = loadDatabase();
    const parts = interaction.customId.split(':');
    const dynasty = db.dynasties.find(d => d.id === parts[1]);
    if (!dynasty || dynasty.status !== 'active') {
      const payload = { content: '❌ This dynasty is no longer active.', ephemeral: true };
      return interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
    }

    if (interaction.isButton()) {
      if (parts[0] === 'blackline_team_release') {
        if (!hasManagementRole(interaction)) return respondPrivately({ content: '❌ Only BL Staff / configured dynasty managers can release a team.', ephemeral: true });
        const taken = getTeamSelections(dynasty);
        if (!taken.length) return respondPrivately({ content: `There are no claimed teams in **${dynasty.name}** to release.`, ephemeral: true });
        const menu = new StringSelectMenuBuilder().setCustomId(`blackline_team_release_select:${dynasty.id}`).setPlaceholder('Choose the team to release...').setMinValues(1).setMaxValues(1);
        for (const entry of taken.slice(0, 25)) menu.addOptions({ label: entry.team.slice(0, 100), value: entry.team, description: `Claimed by ${entry.username || 'a coach'}` });
        return respondPrivately({ content: `Select a claimed team to return it to AVAILABLE in **${dynasty.name}**.`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }
      let page = 0;
      if (parts[0] === 'blackline_team_nav') {
        // Explicitly navigate from the page shown on the clicked button. Using
        // action + current-page fields avoids ambiguous parsing and makes each
        // click advance exactly one 25-team page.
        const action = parts[2];
        const currentPage = Number(parts[3]) || 0;
        page = action === 'next' ? currentPage + 1 : Math.max(0, currentPage - 1);
      } else {
        // Backward compatibility with older team panels already posted in Discord.
        page = Number(parts[2]) || 0;
      }
      // Already acknowledged at handler entry, before database and API work.
      await interaction.editReply(await buildPanel(dynasty, page, interaction.guild, interaction.client));
      if (parts[0] === 'blackline_team_refresh') await updateDashboardMessage(interaction.client, dynasty, db);
      return;
    }

    if (!interaction.isStringSelectMenu()) return;
    if (parts[0] === 'blackline_team_release_select') {
      if (!hasManagementRole(interaction)) return respondPrivately({ content: '❌ Only BL Staff / configured dynasty managers can release a team.', ephemeral: true });
      const teamToRelease = interaction.values[0];
      const releasedClaim = getTeamSelections(dynasty).find(entry => entry.team === teamToRelease);
      if (!releaseTeam(dynasty, teamToRelease)) return respondPrivately({ content: `❌ **${teamToRelease}** is already available.`, ephemeral: true });
      appendTeamClaimAudit(dynasty, 'team_released', { team: teamToRelease, userId: releasedClaim?.userId, username: releasedClaim?.username }, interaction.user);
      saveDatabase(db);
      await notifyTeamClaimChange(interaction.client, dynasty, 'team_released', { team: teamToRelease, username: releasedClaim?.username, actorName: interaction.user.username });
      await syncTeamPanels(interaction.client, dynasty, db, { page: 0 });
      return interaction.editReply({ content: `✅ **${teamToRelease}** is available again in **${dynasty.name}**.`, components: [] });
    }
    const team = interaction.values[0];
    if (team === '__none__') return respondPrivately({ content: '❌ There are no available teams on this page.', ephemeral: true });
    // A dynasty-specific Discord role is the authoritative membership signal for
    // team selection. Older dynasties may have users with the role but no coach
    // record because the role system was added after the dynasty was created.
    // Sync the current user into the coach list automatically instead of forcing
    // them to delete/recreate the dynasty or manually re-join.
    if (!dynasty.coaches.some(c => c.userId === interaction.user.id)) {
      const hasDynastyRole = !!dynasty.discordRoleId && !!interaction.member?.roles?.cache?.has(dynasty.discordRoleId);
      if (!hasDynastyRole) {
        return respondPrivately({ content: `❌ You must join **${dynasty.name}** before selecting a team. If you already have the dynasty Discord role, ask a manager to refresh your membership.`, ephemeral: true });
      }

      const { addCoach } = require('../utils/league');
      const membership = addCoach(dynasty, interaction.user);
      if (!membership.success && membership.reason !== 'already_registered') {
        return respondPrivately({ content: membership.reason === 'full' ? `❌ **${dynasty.name}** is full.` : `❌ BLACKLINE could not add you to **${dynasty.name}**.`, ephemeral: true });
      }
      saveDatabase(db);
    }

    const result = claimTeam(dynasty, team, interaction.user);
    if (!result.success) {
      if (result.reason === 'already_has_team') return respondPrivately({ content: `❌ You already have **${result.team}**. Ask a manager to release it before selecting another team.`, ephemeral: true });
      if (result.reason === 'taken') return respondPrivately({ content: '❌ That team was just taken by someone else. Refresh the panel and choose another available team.', ephemeral: true });
      return respondPrivately({ content: '❌ That team is not available.', ephemeral: true });
    }
    // The Team Selection panel can resolve named server emojis dynamically, but
    // the League Hub reads the persisted teamEmojis map. Persist those same
    // mappings so newly selected programs show their actual logos on the Hub.
    syncNamedTeamEmojiMappings(dynasty, interaction.guild, interaction.client);
    appendTeamClaimAudit(dynasty, 'team_claimed', { team, userId: interaction.user.id, username: interaction.user.username }, interaction.user);
    saveDatabase(db);
    await notifyTeamClaimChange(interaction.client, dynasty, 'team_claimed', { team, username: interaction.user.username });
    // Claim the component interaction before panel/dashboard API work begins.
    await interaction.editReply(await buildPanel(dynasty, Number(parts[2]) || 0, interaction.guild, interaction.client));
    await syncTeamPanels(interaction.client, dynasty, db, { page: Number(parts[2]) || 0 });
    await interaction.followUp({ content: `🏈 You selected **${team}** for **${dynasty.name}**.`, ephemeral: true });
  }
};
