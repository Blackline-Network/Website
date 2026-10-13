'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicJsonWrite } = require('./atomicJsonWrite');
const { loadDatabase, saveDatabase, updateAllDashboards } = require('./league');
const { claimTeam, getTeamEmoji } = require('./teams');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { validateLeagueResult } = require('./leagueResultIntegrity');
const { upsertProspect } = require('./rosterManagement');

const ACTIONS_PATH = path.resolve(process.env.WEBSITE_ACTIONS_PATH || path.join(__dirname, '..', 'data', 'website-actions'));
let busy = false;

function writeAction(file, action) {
  action.updatedAt = new Date().toISOString();
  atomicJsonWrite(file, action, { validate: v => v && typeof v.id === 'string' && ['queued','processing','completed','rejected','failed'].includes(v.status) });
}

async function processWebsiteActions(client) {
  if (busy) return { processed: 0, skipped: true };
  busy = true;
  let processed = 0;
  try {
    if (!fs.existsSync(ACTIONS_PATH)) return { processed };
    const files = fs.readdirSync(ACTIONS_PATH).filter(name => /^[0-9a-f-]{36}\.json$/i.test(name)).sort();
    for (const name of files) {
      const file = path.join(ACTIONS_PATH, name);
      let action;
      try { action = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
      if (!action || !['team-claim', 'score-report', 'recruiting-prospect'].includes(action.type) || action.status !== 'queued') continue;
      action.status = 'processing'; writeAction(file, action);
      try {
        const database = loadDatabase();
        const dynasty = database.dynasties.find(d => String(d.id || '') === String(action.dynastyId));
        if (!dynasty) throw Object.assign(new Error('Dynasty no longer exists.'), { safeStatus: 'rejected' });
        const userId = String(action.actor?.id || '');
        const coach = (Array.isArray(dynasty.coaches) ? dynasty.coaches : []).find(c => String(c.userId || c.discordId || c.discordUserId || '') === userId);
        if (!coach) throw Object.assign(new Error('You are no longer registered as a coach in this dynasty.'), { safeStatus: 'rejected' });
        if (action.type === 'recruiting-prospect') {
          const team = String(action.team || '').trim();
          const name = String(action.name || '').trim();
          const position = String(action.position || '').trim().toUpperCase();
          const stars = Number(action.stars);
          const season = Number(action.season);
          const status = String(action.prospectStatus || action.recruitingStatus || (action.status !== 'queued' && action.status !== 'processing' ? action.status : '') || 'Interested').trim();
          const assigned = (Array.isArray(dynasty.teamSelections) ? dynasty.teamSelections : []).filter(x => String(x.userId || x.coachId || x.discordId || '') === userId).map(x => String(x.team || x.teamName || '').trim().toLowerCase());
          if (!assigned.includes(team.toLowerCase())) throw Object.assign(new Error('You are no longer assigned to that team.'), { safeStatus: 'rejected' });
          if (Number(dynasty.season || 1) !== season) throw Object.assign(new Error('The league season changed before this recruiting update could be processed.'), { safeStatus: 'rejected' });
          if (!name || name.length > 100 || !team || !['QB','RB','WR','TE','OL','DL','EDGE','LB','CB','S','K','P','ATH','Other'].includes(position) || !Number.isInteger(stars) || stars < 1 || stars > 5 || !['Interested','Offered','Visiting','Committed'].includes(status)) throw Object.assign(new Error('The recruiting update contains invalid values or a restricted status.'), { safeStatus: 'rejected' });
          const registered = [...(Array.isArray(dynasty.teamSelections) ? dynasty.teamSelections.map(x => x.team || x.teamName) : []), ...(Array.isArray(dynasty.teams) ? dynasty.teams : [])].map(x => String(typeof x === 'object' ? x.name || x.team || '' : x).trim().toLowerCase());
          if (!registered.includes(team.toLowerCase())) throw Object.assign(new Error('That team is not registered in this dynasty.'), { safeStatus: 'rejected' });
          const result = upsertProspect(dynasty, { name, team, position, stars, season, status }, userId);
          if (result.error) throw Object.assign(new Error(result.error), { safeStatus: 'rejected' });
          if (!Array.isArray(dynasty.staffAuditLog)) dynasty.staffAuditLog = [];
          dynasty.staffAuditLog.push({ at: new Date().toISOString(), action: result.created ? 'website-recruit-prospect-added' : 'website-recruit-prospect-updated', actorId: userId, details: { player: result.prospect.name, team, season, stars, status } });
          saveDatabase(database);
          try { if (client) await updateAllDashboards(client); } catch (error) { console.error('[Website action bridge] Dashboard refresh failed after recruiting update:', error.message); }
          action.status = 'completed'; action.result = { message: `${result.created ? 'Added' : 'Updated'} ${name} for ${team} (${status}).`, prospectName: name, team, season, status };
        } else if (action.type === 'score-report') {
          const week = Number(action.week), homeScore = Number(action.homeScore), awayScore = Number(action.awayScore);
          const homeTeam = String(action.homeTeam || '').trim(), awayTeam = String(action.awayTeam || '').trim();
          if (Number(dynasty.season) !== Number(action.season)) throw Object.assign(new Error('The league season changed before this report could be processed.'), { safeStatus: 'rejected' });
          if (!Number.isInteger(week) || week < 0 || week > 15 || !Number.isInteger(homeScore) || homeScore < 0 || homeScore > 300 || !Number.isInteger(awayScore) || awayScore < 0 || awayScore > 300 || !homeTeam || !awayTeam || homeTeam.toLowerCase() === awayTeam.toLowerCase()) throw Object.assign(new Error('The score report contains invalid teams, week, or scores.'), { safeStatus: 'rejected' });
          const resultError = validateLeagueResult({ week, homeTeam, awayTeam, homeScore, awayScore });
          if (resultError) throw Object.assign(new Error(resultError), { safeStatus: 'rejected' });
          const selections = (dynasty.teamSelections || []).filter(x => String(x.userId || x.coachId || x.discordId || '') === userId).map(x => String(x.team || x.teamName || '').trim().toLowerCase());
          if (!selections.includes(homeTeam.toLowerCase()) && !selections.includes(awayTeam.toLowerCase())) throw Object.assign(new Error('Your assigned team must be part of the reported matchup.'), { safeStatus: 'rejected' });
          if (!dynasty.competitionChannelId) throw Object.assign(new Error('The competition review channel is not configured. Ask a league manager to configure it.'), { safeStatus: 'rejected' });
          if (!Array.isArray(dynasty.pendingScoreReports)) dynasty.pendingScoreReports = [];
          const duplicate = dynasty.pendingScoreReports.some(r => r.status === 'pending' && Number(r.season) === Number(dynasty.season) && Number(r.week) === week && String(r.homeTeam).toLowerCase() === homeTeam.toLowerCase() && String(r.awayTeam).toLowerCase() === awayTeam.toLowerCase());
          if (duplicate) throw Object.assign(new Error('A score report for this matchup is already awaiting review.'), { safeStatus: 'rejected' });
          const report = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, season: dynasty.season, week, homeTeam, awayTeam, homeScore, awayScore, reportedBy: userId, reportedAt: new Date().toISOString(), status: 'pending', source: 'website' };
          dynasty.pendingScoreReports.push(report); saveDatabase(database);
          try {
            const channel = await client?.channels?.fetch(String(dynasty.competitionChannelId)).catch(() => null);
            if (!channel?.isTextBased?.() || !channel.send) throw new Error('Competition review channel unavailable');
            const embed = new EmbedBuilder().setColor(0xD97706).setTitle(`📝 Score Report · ${dynasty.name}`).setDescription(`**Season ${report.season} · Week ${week}**\n${getTeamEmoji(dynasty, awayTeam)} **${awayTeam} ${awayScore}** at ${getTeamEmoji(dynasty, homeTeam)} **${homeTeam} ${homeScore}**\n\nReported from the website by <@${userId}>. This result will not affect standings until a league manager approves it.`).setTimestamp(new Date());
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`blackline_score_review:approve:${dynasty.id}:${report.id}`).setLabel('Approve score').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`blackline_score_review:reject:${dynasty.id}:${report.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger));
            const message = await channel.send({ embeds: [embed], components: [row] });
            const fresh = loadDatabase(); const current = fresh.dynasties.find(d => String(d.id) === String(dynasty.id)); const stored = current?.pendingScoreReports?.find(r => r.id === report.id);
            if (stored) { stored.reviewMessageId = message.id; saveDatabase(fresh); }
          } catch (error) {
            const fresh = loadDatabase(); const current = fresh.dynasties.find(d => String(d.id) === String(dynasty.id));
            if (current) { current.pendingScoreReports = (current.pendingScoreReports || []).filter(r => r.id !== report.id); saveDatabase(fresh); }
            throw Object.assign(new Error('Could not post the report to the competition review channel. Check bot channel permissions.'), { safeStatus: 'rejected' });
          }
          action.status = 'completed'; action.result = { message: 'Score report submitted for staff approval. Standings remain unchanged until approved.', reportId: report.id };
        } else {
        const result = claimTeam(dynasty, String(action.team || ''), { id: userId, username: String(action.actor?.username || coach.username || 'Website coach'), tag: String(action.actor?.username || coach.username || 'Website coach') });
        if (!result.success) {
          const messages = { invalid_team: 'That team is not part of this dynasty’s team pool.', already_has_team: `You already have ${result.team}.`, taken: 'That team has already been claimed.' };
          throw Object.assign(new Error(messages[result.reason] || 'The team claim was not accepted.'), { safeStatus: 'rejected' });
        }
        saveDatabase(database);
        // Mirror the existing Discord workflow's role/panel/dashboard side effects when available.
        try { const guild = dynasty.guildId ? client?.guilds?.cache?.get(String(dynasty.guildId)) : null; if (guild) await client?.blackline?.setDynastyRole(guild, dynasty, userId, true); } catch (error) { console.error('[Website action bridge] Dynasty role sync failed:', error.message); }
        try { const teamsCommand = client?.commands?.get('teams'); if (teamsCommand?.refreshPanel) await teamsCommand.refreshPanel(client, dynasty, 0); } catch (error) { console.error('[Website action bridge] Team panel refresh failed:', error.message); }
        try { if (client) await updateAllDashboards(client); } catch (error) { console.error('[Website action bridge] Dashboard refresh failed:', error.message); }
        action.status = 'completed'; action.result = { message: `${action.team} has been assigned to your coach account.` };
        }
      } catch (error) {
        action.status = error.safeStatus === 'rejected' || /concurrent|snapshot|changed/i.test(error.message) ? 'rejected' : 'failed';
        action.result = { message: action.status === 'rejected' ? error.message : 'The bot could not safely complete this action. Ask staff to review it.' };
        if (action.status === 'failed') console.error('[Website action bridge] Action failed:', error.message);
      }
      writeAction(file, action); processed++;
    }
    return { processed };
  } finally { busy = false; }
}
module.exports = { processWebsiteActions };
