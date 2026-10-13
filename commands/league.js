const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const { recoverPanelTarget, persistPanelReferences } = require('../utils/panelRecovery');
const { loadDatabase, saveDatabase, findDynasty, updateAllDashboards } = require('../utils/league');
const { getTeamEmoji } = require('../utils/teams');
const { programNamesFor, calculateProgramProfile } = require('../utils/programRecords');
const fs = require('fs');
const path = require('path');
const { createDatabaseBackup, listDatabaseBackups, appendAuditEntry, formatAuditEntry, validateChampionScore } = require('../utils/operations');
const { bracketReplacementError, validatePlayoffScore } = require('../utils/playoffSafety');
const { auditSeasonSchedule, validateScheduledGame, seasonCloseError } = require('../utils/seasonIntegrity');
const { prepareSeasonArchive } = require('../utils/seasonTransition');
const { validateLeagueResult, getPreviousResult } = require('../utils/leagueResultIntegrity');
const { calculateAllTimeAnalytics, calculateConferenceStandings } = require('../utils/dynastyAnalytics');
const { calculateTeamAnalytics, recordLabel: analyticsRecordLabel } = require('../utils/teamAnalytics');
const { auditPlayerHistory, playerHistoryAuditSummary } = require('../utils/playerHistoryIntegrity');
const { POSITIONS, CLASSES, ensureRosterData, upsertPlayer, upsertProspect, teamRoster, teamProspects } = require('../utils/rosterManagement');
const { previewOffseason, applyOffseason } = require('../utils/offseasonProgression');
const { coachLegacy, rankCoachLegacy, formatCoachLegacyLines } = require('../utils/coachLegacy');
const { publishLeagueNotification } = require('../utils/leagueNotifications');
const { buildActivityFeed } = require('../utils/activityFeed');
const { calculateRecruitingRankings, calculatePositionNeeds, calculateRecruitingPipeline, buildRecruitingClassArchive, RECRUITING_STATUSES } = require('../utils/recruitingRankings');
const { buildRecruitingHistory } = require('../utils/recruitingHistory');
const { buildRivalryTracker } = require('../utils/rivalryTracker');
const { buildRivalryWeek } = require('../utils/rivalryWeek');
const { buildCoachRivalries } = require('../utils/coachRivalries');
const { buildSigningDayRecap } = require('../utils/signingDay');
const { calculatePowerRankings } = require('../utils/powerRankings');
const { capturePreGameRanks, buildUpsetTracker } = require('../utils/upsetTracker');
const { buildWeeklyRecap } = require('../utils/weeklyRecap');
const { buildSeasonStorylines } = require('../utils/seasonStorylines');
const { buildCoachOfWeek } = require('../utils/coachOfWeek');
const { buildCoachOfYearRace } = require('../utils/coachOfYear');
const { buildCoachCareerBySeason } = require('../utils/coachCareerStats');
const { buildCoachCareerMilestones } = require('../utils/coachCareerMilestones');
const { buildCoachMovementHistory } = require('../utils/coachMovement');
const { buildConferenceChampionshipRace } = require('../utils/conferenceChampionshipRace');
const { buildPlayoffPicture, getScenarioGames, simulatePlayoffScenario } = require('../utils/playoffPicture');
const { buildPlayoffClinchingTracker } = require('../utils/playoffClinching');
const { buildPlayoffHistory } = require('../utils/playoffHistory');
const { buildPlayoffPerformanceRecords } = require('../utils/playoffPerformanceRecords');
const { buildProgramHallOfFame } = require('../utils/programHallOfFame');
const { buildCoachHallOfFame } = require('../utils/coachHallOfFame');
const { buildDynastyRecordBook } = require('../utils/recordBook');
const { buildAwardLeaders } = require('../utils/awardLeaders');
const { buildPlayerCareerRecords } = require('../utils/playerCareerRecords');
const { buildWeeklyLeagueAwards } = require('../utils/weeklyLeagueAwards');
const { buildChampionshipWeekend } = require('../utils/championshipWeekend');
const { buildNationalChampionshipExperience } = require('../utils/nationalChampionshipExperience');
const { buildProgramEvolutionIndex } = require('../utils/programEvolution');
const { buildDynastyAlmanac } = require('../utils/dynastyAlmanac');

const MANAGER_ROLES = (process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager')
    .split(',').map(role => role.trim()).filter(Boolean);

function isManager(interaction) {
    if (interaction.memberPermissions?.has('Administrator')) return true;
    const roles = interaction.member?.roles?.cache;
    return !!roles && roles.some(role => MANAGER_ROLES.includes(role.name) || MANAGER_ROLES.includes(role.id));
}
function splitList(value) { return value.split(/[|,\n]/).map(s => s.trim()).filter(Boolean); }
function ensureLeagueData(dynasty) {
    if (!Array.isArray(dynasty.scheduleGames)) dynasty.scheduleGames = [];
    if (!Array.isArray(dynasty.championshipHistory)) dynasty.championshipHistory = [];
    if (!Array.isArray(dynasty.seasonRankings)) dynasty.seasonRankings = [];
}
function currentSeasonGames(dynasty) {
    ensureLeagueData(dynasty);
    return dynasty.scheduleGames.filter(game => Number(game.season) === Number(dynasty.season));
}
function normalizeTeam(name) { return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function findGame(dynasty, week, home, away) {
    const h = normalizeTeam(home), a = normalizeTeam(away);
    return currentSeasonGames(dynasty).find(game => Number(game.week) === Number(week) &&
        ((normalizeTeam(game.homeTeam) === h && normalizeTeam(game.awayTeam) === a) ||
         (normalizeTeam(game.homeTeam) === a && normalizeTeam(game.awayTeam) === h)));
}
function standingsFor(dynasty) {
    const rows = new Map();
    const row = team => {
        const key = normalizeTeam(team);
        if (!rows.has(key)) rows.set(key, { team, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0 });
        return rows.get(key);
    };
    for (const selection of dynasty.teamSelections || []) row(selection.team);
    for (const game of currentSeasonGames(dynasty).filter(g => g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore))) {
        const home = row(game.homeTeam), away = row(game.awayTeam);
        home.games++; away.games++;
        home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
        away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
        if (game.homeScore > game.awayScore) { home.wins++; away.losses++; }
        else if (game.homeScore < game.awayScore) { away.wins++; home.losses++; }
        else { home.ties++; away.ties++; }
    }
    return [...rows.values()].sort((a, b) => {
        const pctA = (a.wins + a.ties * 0.5) / Math.max(1, a.games);
        const pctB = (b.wins + b.ties * 0.5) / Math.max(1, b.games);
        if (pctB !== pctA) return pctB - pctA;
        // First tiebreaker: head-to-head result when these two teams played.
        const headToHead = currentSeasonGames(dynasty).filter(g => g.status === 'final' &&
            ((normalizeTeam(g.homeTeam) === normalizeTeam(a.team) && normalizeTeam(g.awayTeam) === normalizeTeam(b.team)) ||
             (normalizeTeam(g.homeTeam) === normalizeTeam(b.team) && normalizeTeam(g.awayTeam) === normalizeTeam(a.team))));
        let aH2H = 0, bH2H = 0;
        for (const game of headToHead) {
            const aIsHome = normalizeTeam(game.homeTeam) === normalizeTeam(a.team);
            const aScore = aIsHome ? game.homeScore : game.awayScore;
            const bScore = aIsHome ? game.awayScore : game.homeScore;
            if (aScore > bScore) aH2H++; else if (bScore > aScore) bH2H++;
        }
        if (aH2H !== bH2H) return bH2H - aH2H;
        const diffA = a.pointsFor - a.pointsAgainst, diffB = b.pointsFor - b.pointsAgainst;
        return diffB - diffA || b.pointsFor - a.pointsFor || a.team.localeCompare(b.team);
    });
}
function generateRoundRobinSchedule(teams, requestedWeeks, dynasty, userId) {
    const distinct = [];
    const seen = new Set();
    for (const team of teams) {
        const key = normalizeTeam(team);
        if (key && !seen.has(key)) { seen.add(key); distinct.push(team); }
    }
    if (distinct.length < 2) return { error: 'At least two registered teams are required to generate a schedule.' };
    const maxUniqueWeeks = distinct.length % 2 === 1 ? distinct.length : distinct.length - 1;
    if (requestedWeeks > Math.min(15, maxUniqueWeeks)) {
        return { error: `With ${distinct.length} teams, a no-rematch schedule supports at most ${Math.min(15, maxUniqueWeeks)} weeks. Choose a lower week count or add more teams.` };
    }
    const ring = [...distinct];
    if (ring.length % 2 === 1) ring.push(null);
    const generated = [];
    const now = new Date().toISOString();
    for (let round = 0; round < requestedWeeks; round++) {
        for (let i = 0; i < ring.length / 2; i++) {
            const left = ring[i];
            const right = ring[ring.length - 1 - i];
            if (!left || !right) continue;
            // Alternate home advantage by round and matchup so teams do not all start at home.
            const leftHome = (round + i) % 2 === 0;
            generated.push({
                id: `sched-${dynasty.season}-${round + 1}-${i + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                season: dynasty.season,
                week: round + 1,
                homeTeam: leftHome ? left : right,
                awayTeam: leftHome ? right : left,
                kickoff: null,
                status: 'scheduled',
                source: 'round-robin-generator',
                createdBy: userId,
                createdAt: now
            });
        }
        // Circle-method round robin: keep the first team fixed and rotate the remaining teams.
        const fixed = ring[0];
        const rotating = ring.slice(1);
        rotating.unshift(rotating.pop());
        ring.splice(0, ring.length, fixed, ...rotating);
    }
    return { games: generated, weeks: requestedWeeks, teams: distinct };
}

function formatGame(dynasty, game) {
    const home = `${getTeamEmoji(dynasty, game.homeTeam)} ${game.homeTeam}`;
    const away = `${getTeamEmoji(dynasty, game.awayTeam)} ${game.awayTeam}`;
    const weekLabel = `Week ${game.week}`;
    if (game.status === 'final') return `**${weekLabel}** · ${away} **${game.awayScore}** at ${home} **${game.homeScore}** · FINAL`;
    const date = game.kickoff ? ` · <t:${Math.floor(new Date(game.kickoff).getTime() / 1000)}:f>` : '';
    return `**${weekLabel}** · ${away} at ${home}${date} · Scheduled`;
}



function playoffRoundName(round, totalRounds) {
    if (round === totalRounds) return 'Championship';
    if (round === totalRounds - 1) return 'Semifinals';
    if (round === totalRounds - 2) return 'Quarterfinals';
    return `Round ${round}`;
}
function orderedLeagueTeams(dynasty) {
    const latestSeasonRanking = (dynasty.seasonRankings || [])
        .filter(record => Number(record.season) === Number(dynasty.season) && Array.isArray(record.teams))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
    const rankingTeams = [...(latestSeasonRanking?.teams || []), ...(dynasty.rankings || [])].filter(t => t && t !== 'N/A');
    const standingTeams = standingsFor(dynasty).map(r => r.team);
    const selectedTeams = (dynasty.teamSelections || []).map(s => s.team);
    const seen = new Set();
    return [...rankingTeams, ...standingTeams, ...selectedTeams].filter(team => {
        const key = normalizeTeam(team);
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
    });
}
function buildPlayoffBracket(dynasty, qualifiedTeams = null) {
    const size = 12;
    const pool = qualifiedTeams || orderedLeagueTeams(dynasty);
    if (pool.length < size) return { error: `A 12-team playoff requires at least 12 distinct qualified teams. Only ${pool.length} are available.` };
    const seeds = pool.slice(0, size).map((team, i) => ({ seed: i + 1, team }));
    const teamAtSeed = seed => seeds[seed - 1].team;
    const rounds = [
        { round: 1, name: 'Opening Round', games: [] },
        { round: 2, name: 'Quarterfinals', games: [] },
        { round: 3, name: 'Semifinals', games: [] },
        { round: 4, name: 'Championship', games: [] }
    ];
    // Twelve-team format: seeds 1–4 receive byes; seeds 5–12 play in the opening round.
    const openingMatchups = [[5, 12, 1], [6, 11, 3], [7, 10, 2], [8, 9, 0]];
    rounds[0].games = openingMatchups.map(([homeSeed, awaySeed, targetGame], i) => ({
        id: `r1g${i + 1}`, homeTeam: teamAtSeed(homeSeed), awayTeam: teamAtSeed(awaySeed),
        homeSeed, awaySeed, homeScore: null, awayScore: null, status: 'scheduled', winner: null,
        advanceTo: { round: 2, gameIndex: targetGame, slot: 'away' }
    }));
    // Keep the traditional seed path: 1 vs 8/9, 4 vs 5/12, 2 vs 7/10, 3 vs 6/11.
    rounds[1].games = [
        { id: 'r2g1', homeTeam: teamAtSeed(1), awayTeam: null, homeSeed: 1, status: 'pending', advanceTo: { round: 3, gameIndex: 0, slot: 'home' } },
        { id: 'r2g2', homeTeam: teamAtSeed(4), awayTeam: null, homeSeed: 4, status: 'pending', advanceTo: { round: 3, gameIndex: 0, slot: 'away' } },
        { id: 'r2g3', homeTeam: teamAtSeed(2), awayTeam: null, homeSeed: 2, status: 'pending', advanceTo: { round: 3, gameIndex: 1, slot: 'home' } },
        { id: 'r2g4', homeTeam: teamAtSeed(3), awayTeam: null, homeSeed: 3, status: 'pending', advanceTo: { round: 3, gameIndex: 1, slot: 'away' } }
    ].map(game => ({ homeScore: null, awayScore: null, winner: null, ...game }));
    rounds[2].games = [
        { id: 'r3g1', homeTeam: null, awayTeam: null, status: 'pending', advanceTo: { round: 4, gameIndex: 0, slot: 'home' } },
        { id: 'r3g2', homeTeam: null, awayTeam: null, status: 'pending', advanceTo: { round: 4, gameIndex: 0, slot: 'away' } }
    ].map(game => ({ homeScore: null, awayScore: null, winner: null, ...game }));
    rounds[3].games = [{ id: 'r4g1', homeTeam: null, awayTeam: null, homeScore: null, awayScore: null, status: 'pending', winner: null }];
    return {
        season: Number(dynasty.season), size, seeds, rounds,
        createdAt: new Date().toISOString(), createdBy: null, status: 'active', champion: null
    };
}
function qualifyPlayoffTeams(dynasty) {
    const teams = orderedLeagueTeams(dynasty);
    if (teams.length < 12) return { error: `The 12-team playoff needs at least 12 distinct teams; only ${teams.length} are available.` };
    const conferenceMap = dynasty.teamConferences || {};
    const assignments = new Map();
    for (const team of teams) {
        const record = conferenceMap[normalizeTeam(team)];
        if (record && String(record).trim()) assignments.set(normalizeTeam(team), String(record).trim());
    }
    const conferences = new Map();
    for (const team of teams) {
        const conference = assignments.get(normalizeTeam(team));
        if (!conference) continue;
        if (!conferences.has(conference)) conferences.set(conference, []);
        conferences.get(conference).push(team);
    }
    if (!conferences.size) return { error: 'No conferences have been assigned yet. Use `/league conference-set` for teams, then run playoff qualification.' };
    const standingsOrder = standingsFor(dynasty);
    const standingPosition = new Map(standingsOrder.map((row, i) => [normalizeTeam(row.team), i]));
    const rankPosition = new Map(teams.map((team, i) => [normalizeTeam(team), i]));
    const compareOverall = (a, b) => (rankPosition.get(normalizeTeam(a)) ?? 999) - (rankPosition.get(normalizeTeam(b)) ?? 999)
        || (standingPosition.get(normalizeTeam(a)) ?? 999) - (standingPosition.get(normalizeTeam(b)) ?? 999);
    const conferenceChampions = [...conferences.entries()].map(([conference, members]) => ({
        conference,
        team: [...members].sort((a, b) => (standingPosition.get(normalizeTeam(a)) ?? 999) - (standingPosition.get(normalizeTeam(b)) ?? 999) || compareOverall(a, b))[0]
    })).sort((a, b) => compareOverall(a.team, b.team));
    // Five highest-ranked conference champions receive automatic bids; remaining places are at-large.
    const automatic = conferenceChampions.slice(0, 5).map(item => item.team);
    const selected = new Set(automatic.map(normalizeTeam));
    const atLarge = teams.filter(team => !selected.has(normalizeTeam(team))).slice(0, 12 - automatic.length);
    const qualifiedSet = [...automatic, ...atLarge];
    if (qualifiedSet.length < 12) return { error: `Only ${qualifiedSet.length} playoff qualifiers could be determined. Ensure at least 12 teams are registered.` };
    // The four highest-ranked conference champions (or available champions, then best remaining teams)
    // occupy the four bye seeds. Remaining qualifiers follow the league ranking/standings order.
    const byeTeams = conferenceChampions.slice(0, 4).map(item => item.team);
    for (const team of teams) {
        if (byeTeams.length >= 4) break;
        if (qualifiedSet.some(q => normalizeTeam(q) === normalizeTeam(team)) && !byeTeams.some(q => normalizeTeam(q) === normalizeTeam(team))) byeTeams.push(team);
    }
    const byeSet = new Set(byeTeams.map(normalizeTeam));
    const seedOrder = [...byeTeams, ...qualifiedSet.filter(team => !byeSet.has(normalizeTeam(team))).sort(compareOverall)];
    return { teams: seedOrder.slice(0, 12), automatic, atLarge, conferenceChampions, conferences: [...conferences.keys()] };
}

function playoffBracketEmbed(dynasty) {
    const bracket = dynasty.playoffBracket;
    const embed = new EmbedBuilder().setColor(0x243447)
        .setTitle(`🏆 ${dynasty.name} · Season ${dynasty.season} Playoff Bracket`);
    if (!bracket || !Array.isArray(bracket.rounds)) {
        return embed.setDescription('No playoff bracket has been created yet. League management can use `/league playoff-setup` to seed the bracket.');
    }
    const fields = [];
    for (const round of bracket.rounds) {
        const lines = round.games.map((game, i) => {
            if (game.homeTeam && !game.awayTeam) return `**Game ${i + 1}:** ${getTeamEmoji(dynasty, game.homeTeam)} **${game.homeTeam}** has a first-round bye; awaiting opponent`;
            if (!game.homeTeam || !game.awayTeam) return `**Game ${i + 1}:** Awaiting previous-round winners`;
            const score = game.status === 'final' ? ` — **${game.homeScore}–${game.awayScore}** · Winner: **${game.winner}**` : ' — Scheduled';
            return `**Game ${i + 1}:** ${getTeamEmoji(dynasty, game.homeTeam)} ${game.homeTeam} vs. ${getTeamEmoji(dynasty, game.awayTeam)} ${game.awayTeam}${score}`;
        });
        fields.push({ name: round.name, value: (lines.join('\n') || 'No matchups').slice(0, 1024), inline: false });
    }
    if (bracket.champion) fields.push({ name: 'Champion', value: `🏆 **${bracket.champion}**`, inline: false });
    embed.setDescription(`**${bracket.size}-team playoff** · ${bracket.status === 'complete' ? 'Complete' : 'In progress'}\nSeedings are based on published rankings first, then standings, then selected teams.`);
    embed.addFields(fields.slice(0, 25)).setFooter({ text: 'Results are entered by league management; winners advance automatically' }).setTimestamp(new Date());
    return embed;
}
function recordPlayoffResult(dynasty, roundNumber, homeTeam, awayTeam, homeScore, awayScore) {
    const bracket = dynasty.playoffBracket;
    if (!bracket || Number(bracket.season) !== Number(dynasty.season)) return { error: 'Create a current-season playoff bracket first with `/league playoff-setup`.' };
    const scoreError = validatePlayoffScore(homeScore, awayScore);
    if (scoreError) return { error: scoreError };
    const round = bracket.rounds.find(r => Number(r.round) === roundNumber);
    if (!round) return { error: `Round ${roundNumber} does not exist in this bracket.` };
    const game = round.games.find(g => g.homeTeam && g.awayTeam &&
        ((normalizeTeam(g.homeTeam) === normalizeTeam(homeTeam) && normalizeTeam(g.awayTeam) === normalizeTeam(awayTeam)) ||
         (normalizeTeam(g.homeTeam) === normalizeTeam(awayTeam) && normalizeTeam(g.awayTeam) === normalizeTeam(homeTeam))));
    if (!game) return { error: 'That matchup is not present in the selected playoff round. Check the bracket and team names.' };
    if (game.status === 'final') return { error: 'That playoff game already has a final result. Contact a manager before correcting it.' };
    if (normalizeTeam(game.homeTeam) !== normalizeTeam(homeTeam)) return { error: `Use the bracket's home/away order: **${game.homeTeam}** is home and **${game.awayTeam}** is away.` };
    game.homeScore = homeScore; game.awayScore = awayScore;
    game.winner = homeScore > awayScore ? game.homeTeam : game.awayTeam;
    game.status = 'final'; game.recordedAt = new Date().toISOString();
    const nextRound = bracket.rounds.find(r => r.round === roundNumber + 1);
    if (nextRound) {
        const target = game.advanceTo;
        const gameIndex = round.games.indexOf(game);
        const nextGame = target ? nextRound.games[target.gameIndex] : nextRound.games[Math.floor(gameIndex / 2)];
        const slot = target?.slot || (gameIndex % 2 === 0 ? 'home' : 'away');
        nextGame[slot === 'away' ? 'awayTeam' : 'homeTeam'] = game.winner;
        if (nextGame.homeTeam && nextGame.awayTeam) nextGame.status = 'scheduled';
    } else {
        bracket.champion = game.winner;
        bracket.status = 'complete';
    }
    return { game, champion: bracket.champion };
}

function buildCompetitionPanelEmbed(dynasty) {
    ensureLeagueData(dynasty);
    const games = currentSeasonGames(dynasty);
    const finals = games.filter(g => g.status === 'final');
    const upcoming = games.filter(g => g.status !== 'final').sort((a,b) => a.week-b.week || (a.kickoff||'').localeCompare(b.kickoff||'')).slice(0, 3);
    const topRankings = (dynasty.rankings || []).filter(t => t && t !== 'N/A').slice(0, 4);
    const champ = (dynasty.championshipHistory || []).find(h => Number(h.season) === Number(dynasty.season));
    const upcomingText = upcoming.length
        ? upcoming.map(g => `• **W${g.week}** ${getTeamEmoji(dynasty, g.awayTeam)} ${g.awayTeam} at ${getTeamEmoji(dynasty, g.homeTeam)} ${g.homeTeam}${g.kickoff ? ` · <t:${Math.floor(new Date(g.kickoff).getTime()/1000)}:f>` : ''}`).join('\n')
        : 'No upcoming games scheduled.';
    return new EmbedBuilder()
        .setColor(0x243447)
        .setTitle(`🏆 BLACKLINE · ${dynasty.name} Competition Center`)
        .setDescription('Your central hub for league schedules, standings, rankings, and championship history.\n\nUse the buttons below to view live league information.')
        .addFields(
            { name: 'Season', value: `**Season ${dynasty.season} · ${dynasty.seasonYear}**\n${dynasty.currentPhaseLabel || 'Off-Season'}`, inline: true },
            { name: 'Games', value: `**${finals.length}** completed\n**${games.length - finals.length}** scheduled`, inline: true },
            { name: 'Defending Champion', value: dynasty.defendingChampion && dynasty.defendingChampion !== 'N/A' ? `🏆 ${dynasty.defendingChampion}` : 'Not recorded', inline: true },
            { name: 'Upcoming Matchups', value: upcomingText.slice(0, 1024), inline: false },
            { name: 'Current Top 4', value: topRankings.length ? topRankings.map((team, i) => `**${i+1}.** ${getTeamEmoji(dynasty, team)} ${team}`).join('\n') : 'Rankings have not been published yet.', inline: false }
        )
        .setFooter({ text: 'BLACKLINE League Operations · Automatically synchronized with verified league results' })
        .setTimestamp(new Date());
}

function buildHistoryPanelEmbed(dynasty) {
    ensureLeagueData(dynasty);
    const championships = [...(dynasty.championshipHistory || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const archives = [...(dynasty.seasonArchives || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const conferences = [...(dynasty.conferenceChampionsHistory || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const heismans = [...(dynasty.heismanHistory || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const awards = [...(dynasty.awardHistory || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const drafts = [...(dynasty.draftHistory || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const records = [...(dynasty.recordHistory || [])].sort((a, b) => Number(b.season) - Number(a.season));
    const yearFor = record => record.year || (Number(dynasty.seasonYear) - Number(dynasty.season) + Number(record.season)) || '—';
    const champLines = championships.map(r => `**S${r.season} (${yearFor(r)})** 🏆 ${r.champion || 'Champion not recorded'}${r.runnerUp ? ` — runner-up: ${r.runnerUp}` : ''}${r.championScore !== null && r.championScore !== undefined ? ` (${r.championScore}–${r.runnerUpScore ?? '—'})` : ''}`);
    const conferenceLines = conferences.map(r => `**S${r.season} (${yearFor(r)}) · ${r.conference || 'Conference'}:** ${r.champion || r.team || r.winner || 'Winner not recorded'}${r.runnerUp ? ` over ${r.runnerUp}` : ''}`);
    const heismanLines = heismans.map(r => `**S${r.season} (${yearFor(r)}):** ${r.winner || r.player || r.recipient || 'Winner not recorded'}${r.team ? ` — ${r.team}` : ''}${r.detail ? ` · ${r.detail}` : ''}`);
    const awardLines = awards.map(r => `**S${r.season} (${yearFor(r)}) · ${r.award || r.type || 'Award'}:** ${r.winner || r.player || r.recipient || 'Winner not recorded'}${r.team ? ` — ${r.team}` : ''}${r.detail ? ` · ${r.detail}` : ''}`);
    const draftLines = drafts.map(r => `**S${r.season} (${yearFor(r)})** — ${r.player || r.winner || 'Player not recorded'}${r.team ? ` · ${r.team}` : ''}${r.detail ? ` · ${r.detail}` : ''}`);
    const recordLines = records.map(r => `**S${r.season} (${yearFor(r)}) · ${r.category || r.record || 'Record'}:** ${r.holder || r.recipient || r.team || 'Not recorded'}${r.value ? ` — ${r.value}` : ''}${r.detail ? ` · ${r.detail}` : ''}`);
    const archiveLines = archives.filter(a => !championships.some(c => Number(c.season) === Number(a.season))).map(a => `**S${a.season} (${yearFor(a)})** ${a.champion ? `🏆 ${a.champion}` : 'Season archived; champion not recorded'}`);
    const section = (lines, empty) => { if (!lines.length) return empty; let out = ''; for (const line of lines) { const next = out ? `${out}\n${line}` : line; if (next.length > 1024) break; out = next; } return out || empty; };
    const embed = new EmbedBuilder().setColor(0x243447)
        .setTitle(`📚 ${dynasty.name} · Complete League History`)
        .setDescription('Official historical record for league champions, conference champions, the Heisman Trophy, individual awards, season archives, and notable records. Staff can add missing historical winners with `/league history-record`.' .slice(0, 4000))
        .addFields(
            { name: '🏆 National Champions', value: section(champLines, 'No national champions recorded yet.'), inline: false },
            { name: '🏅 Conference Champions', value: section(conferenceLines, 'No conference champions recorded yet.'), inline: false },
            { name: ' Heisman Trophy Winners', value: section(heismanLines, 'No Heisman winners recorded yet.'), inline: false },
            { name: '🎖️ Other Award Winners', value: section(awardLines, 'No individual award winners recorded yet.'), inline: false },
            { name: '🏈 Drafted Players', value: section(draftLines, 'No drafted players recorded yet.'), inline: false },
            { name: '📈 Records & Honors', value: section(recordLines, 'No records or additional honors recorded yet.'), inline: false },
            { name: '🗂️ Archived Seasons', value: section(archiveLines, 'No additional season archives recorded.'), inline: false },
            { name: 'Current Season', value: `Season ${dynasty.season} · ${dynasty.seasonYear} · ${dynasty.currentPhaseLabel || 'Off-Season'}`, inline: true },
            { name: 'National Champions', value: String(championships.filter(r => r.champion).length), inline: true },
            { name: 'Archived Seasons', value: String(archives.length), inline: true }
        );
    return embed.setFooter({ text: 'BLACKLINE League History · Use Refresh History to reload official records' }).setTimestamp(new Date());
}


function buildAllTimeStatsEmbed(dynasty) {
    ensureLeagueData(dynasty);
    const championships = dynasty.championshipHistory || [];
    const conferenceTitles = dynasty.conferenceChampionsHistory || [];
    const heismans = dynasty.heismanHistory || [];
    const awards = dynasty.awardHistory || [];
    const finals = (dynasty.scheduleGames || []).filter(g => g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore))
        .sort((a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week) || String(a.finishedAt || a.createdAt || '').localeCompare(String(b.finishedAt || b.createdAt || '')));
    const teams = new Map();
    const getTeam = name => {
        const key = normalizeTeam(name || 'Unknown team');
        if (!teams.has(key)) teams.set(key, { name: name || 'Unknown team', wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, currentStreak: 0, currentType: null, longestWinStreak: 0 });
        return teams.get(key);
    };
    for (const game of finals) {
        const home = getTeam(game.homeTeam), away = getTeam(game.awayTeam);
        home.pf += game.homeScore; home.pa += game.awayScore;
        away.pf += game.awayScore; away.pa += game.homeScore;
        let homeResult, awayResult;
        if (game.homeScore > game.awayScore) { home.wins++; away.losses++; homeResult = 'W'; awayResult = 'L'; }
        else if (game.homeScore < game.awayScore) { away.wins++; home.losses++; homeResult = 'L'; awayResult = 'W'; }
        else { home.ties++; away.ties++; homeResult = awayResult = 'T'; }
        for (const [team, result] of [[home, homeResult], [away, awayResult]]) {
            if (team.currentType === result) team.currentStreak++;
            else { team.currentType = result; team.currentStreak = 1; }
            if (result === 'W') team.longestWinStreak = Math.max(team.longestWinStreak, team.currentType === 'W' ? team.currentStreak : 1);
        }
    }
    const titleCounts = new Map();
    for (const record of championships) if (record.champion) {
        const key = normalizeTeam(record.champion); const old = titleCounts.get(key) || { name: record.champion, titles: 0 };
        old.titles++; titleCounts.set(key, old);
    }
    const conferenceCounts = new Map();
    for (const record of conferenceTitles) {
        const winner = record.champion || record.team || record.winner;
        if (!winner) continue;
        const key = normalizeTeam(winner); const old = conferenceCounts.get(key) || { name: winner, titles: 0 };
        old.titles++; conferenceCounts.set(key, old);
    }
    const heismanCounts = new Map();
    for (const record of heismans) {
        const winner = record.winner || record.player || record.recipient;
        if (!winner) continue;
        const key = normalizeTeam(winner); const old = heismanCounts.get(key) || { name: winner, wins: 0, team: record.team };
        old.wins++; if (!old.team && record.team) old.team = record.team; heismanCounts.set(key, old);
    }
    const top = (arr, field, format, limit=8) => arr.sort((a,b) => b[field]-a[field] || a.name.localeCompare(b.name)).slice(0,limit).map((r,i)=>`${i+1}. **${r.name}** — ${format(r)}`).join('\n') || 'No recorded data yet.';
    const teamRows = [...teams.values()];
    const winningPct = r => (r.wins + r.ties * 0.5) / Math.max(1, r.wins + r.losses + r.ties);
    const topWinPct = teamRows.filter(r => r.wins + r.losses + r.ties > 0).sort((a,b)=>winningPct(b)-winningPct(a) || b.wins-a.wins).slice(0,8).map((r,i)=>`${i+1}. **${r.name}** — ${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''} (${(winningPct(r)*100).toFixed(1)}%)`).join('\n') || 'No approved final scores recorded yet.';
    const topStreaks = [...teamRows].filter(r=>r.longestWinStreak>0).sort((a,b)=>b.longestWinStreak-a.longestWinStreak || a.name.localeCompare(b.name)).slice(0,8).map((r,i)=>`${i+1}. **${r.name}** — ${r.longestWinStreak} straight wins`).join('\n') || 'No winning streaks recorded yet.';
    const embed = new EmbedBuilder().setColor(0x243447).setTitle(`📊 ${dynasty.name} · All-Time Records`)
        .setDescription('Statistics are calculated from recorded historical titles and approved final game scores. Missing or unrecorded seasons are not inferred.')
        .addFields(
            {name:'🏆 National Titles',value:top([...titleCounts.values()],'titles',r=>`${r.titles} title${r.titles===1?'':'s'}`),inline:true},
            {name:'🏅 Conference Titles',value:top([...conferenceCounts.values()],'titles',r=>`${r.titles} title${r.titles===1?'':'s'}`),inline:true},
            {name:'🎖️ Heisman Awards',value:top([...heismanCounts.values()],'wins',r=>`${r.wins} win${r.wins===1?'':'s'}${r.team?` · ${r.team}`:''}`),inline:true},
            {name:'📈 Best Team Winning Percentage',value:topWinPct,inline:false},
            {name:'🔥 Longest Winning Streaks',value:topStreaks,inline:false},
            {name:'🏈 Scoring Leaders',value:top(teamRows,'pf',r=>`${r.pf} PF · ${r.pa} PA · ${r.pf-r.pa>=0?'+':''}${r.pf-r.pa} diff`),inline:false},
            {name:'🧭 Strength of Schedule',value:(() => { const leaders=calculateAllTimeAnalytics(dynasty).strengthLeaders.slice(0,6); return leaders.length ? leaders.map((r,i)=>`${i+1}. **${r.name}** — ${(r.strengthOfSchedule*100).toFixed(1)}% opponent win rate · ${r.opponentCount} games`).join('\n') : 'Not enough completed games to calculate strength of schedule.'; })(),inline:false},
            {name:'Data Coverage',value:`**${finals.length}** approved final games · **${championships.filter(r=>r.champion).length}** national champions recorded · **${conferenceTitles.length}** conference titles recorded · **${heismans.length}** Heisman records · **${(dynasty.draftHistory || []).length}** drafted players recorded`,inline:false}
        );
    return embed.setFooter({text:'BLACKLINE · All-time statistics reflect data currently recorded in the league database'}).setTimestamp(new Date());
}

function buildProgramProfileEmbed(dynasty, teamName) {
    const profile = calculateProgramProfile(dynasty, teamName);
    const { games, record } = profile;
    const fmt = r => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;
    const seasonLines = [...record.seasons.entries()].sort((a,b)=>b[0]-a[0]).slice(0,12)
        .map(([season, r]) => `**Season ${season}** — ${fmt(r)} · ${r.games} games`);
    const coachLines = profile.careers.slice(-10).reverse().map(c => {
        const coach = (dynasty.coaches || []).find(x => String(x.userId) === String(c.userId));
        return `**${coach?.username || `<@${c.userId}>`}** — Seasons ${c.startSeason}–${c.endSeason ?? c.startSeason}${c.wins !== undefined ? ` · ${c.wins}-${c.losses ?? 0}${c.ties ? `-${c.ties}` : ''}` : ''}`;
    });
    const gameCount = record.wins + record.losses + record.ties;
    const analytics = calculateTeamAnalytics(dynasty, teamName);
    const splitLine = split => split.games ? `${analyticsRecordLabel(split)} · ${(split.winPercentage * 100).toFixed(1)}% · ${split.games} games` : 'No finalized games recorded.';
    const bestSeasonLine = analytics.bestSeason ? `Season ${analytics.bestSeason.season}: ${analyticsRecordLabel(analytics.bestSeason)} · ${analytics.bestSeason.pointDifferential >= 0 ? '+' : ''}${analytics.bestSeason.pointDifferential} diff` : 'No season records available.';
    const worstSeasonLine = analytics.worstSeason ? `Season ${analytics.worstSeason.season}: ${analyticsRecordLabel(analytics.worstSeason)} · ${analytics.worstSeason.pointDifferential >= 0 ? '+' : ''}${analytics.worstSeason.pointDifferential} diff` : 'No season records available.';
    const currentStreakLine = analytics.currentStreak.count ? `${analytics.currentStreak.count} ${analytics.currentStreak.type === 'W' ? 'straight win(s)' : analytics.currentStreak.type === 'L' ? 'straight loss(es)' : 'straight tie(s)'}` : 'No finalized games recorded.';
    const standout = item => item ? `Season ${item.season}${item.week ? `, Week ${item.week}` : ''} vs. ${item.opponent} (${item.scored}–${item.allowed})` : 'None recorded.';
    return new EmbedBuilder().setColor(0x243447).setTitle(`🏈 ${teamName} · Program Profile`)
        .setDescription('Program totals use recorded final scores and explicitly recorded history only. Missing seasons and awards are not inferred.')
        .addFields(
            { name: 'All-Time Record', value: `**${fmt(record)}**\n${games.length} recorded games · ${(gameCount) ? ((record.wins + record.ties * 0.5) / gameCount * 100).toFixed(1) : '0.0'}% win rate`, inline: true },
            { name: 'Scoring', value: `**${record.pf}** points for\n**${record.pa}** points against\n${record.pf-record.pa >= 0 ? '+' : ''}${record.pf-record.pa} differential`, inline: true },
            { name: 'Program Honors', value: `🏆 National titles: **${profile.titles.length}**\n🏅 Conference titles: **${profile.conferenceTitles.length}**\n🎖️ Heisman winners on record: **${profile.heismans.length}**\n🏈 Draft picks on record: **${profile.draftPicks.length}**\n🏵️ Other awards: **${profile.awards.length}**`, inline: true },
            { name: 'Home vs. Away', value: `**Home:** ${splitLine(analytics.home)}\n**Away:** ${splitLine(analytics.away)}`, inline: false },
            { name: 'Scoring Efficiency', value: `${analytics.overall.pointsPerGame.toFixed(1)} points scored/game · ${analytics.overall.pointsAllowedPerGame.toFixed(1)} allowed/game\n${analytics.shutouts} shutout(s) · ${analytics.oneScoreGames} one-score game(s) · ${analytics.longestWinStreak} longest win streak`, inline: true },
            { name: 'Season Extremes & Streak', value: `**Best:** ${bestSeasonLine}\n**Lowest:** ${worstSeasonLine}\n**Current:** ${currentStreakLine}`, inline: true },
            { name: 'Largest Margins', value: `**Biggest win:** ${standout(analytics.biggestWin)}\n**Biggest loss:** ${standout(analytics.biggestLoss)}`, inline: false },
            { name: 'Season-by-Season Records', value: seasonLines.length ? seasonLines.join('\n').slice(0, 1024) : 'No approved final scores recorded for this program yet.', inline: false },
            { name: 'Recorded Coaching Tenures', value: coachLines.length ? coachLines.join('\n').slice(0, 1024) : 'No coach-career tenures are linked to this program yet.', inline: false }
        ).setFooter({ text: `${dynasty.name} · Program profile is read-only for all members` }).setTimestamp(new Date());
}

function buildProgramSelector(dynasty) {
    const names = programNamesFor(dynasty).slice(0, 25);
    if (!names.length) return [];
    return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(`blackline_history_program:${dynasty.id}`)
        .setPlaceholder('View an individual program profile')
        .addOptions(names.map(name => ({ label: name.slice(0, 100), value: name.slice(0, 100) })) ))];
}

function buildProgramStatsComponents(dynasty) {
    return [
        ...buildProgramSelector(dynasty),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_program-hall-of-fame:${dynasty.id}`).setLabel('Program Hall of Fame').setEmoji('🏛️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_program-evolution:${dynasty.id}`).setLabel('Dynasty Timeline').setEmoji('📜').setStyle(ButtonStyle.Primary)
        )
    ];
}

function buildHistoryPanelButtons(dynastyId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_history_champions:${dynastyId}`).setLabel('National Champions').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_history_conferences:${dynastyId}`).setLabel('Conference Titles').setEmoji('🏅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_heisman:${dynastyId}`).setLabel('Heisman').setEmoji('🎖️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_awards:${dynastyId}`).setLabel('Other Awards').setEmoji('🏵️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_records:${dynastyId}`).setLabel('Records').setEmoji('📈').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_history_archives:${dynastyId}`).setLabel('Season Archives').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_draft:${dynastyId}`).setLabel('Drafted Players').setEmoji('🏈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_stats:${dynastyId}`).setLabel('All-Time Stats').setEmoji('📊').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_history_overview:${dynastyId}`).setLabel('Overview').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_refresh:${dynastyId}`).setLabel('Refresh Panel').setEmoji('🔄').setStyle(ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_history_award-leaders:${dynastyId}`).setLabel('Award Leaders').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_history_player-careers:${dynastyId}`).setLabel('Player Careers').setEmoji('📊').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_history_dynasty-almanac:${dynastyId}`).setLabel('Dynasty Almanac').setEmoji('📚').setStyle(ButtonStyle.Primary)
        )
    ];
}

function buildHistoryCategoryEmbed(dynasty, category) {
    ensureLeagueData(dynasty);
    const yearFor = record => record.year || (Number(dynasty.seasonYear) - Number(dynasty.season) + Number(record.season)) || '—';
    const config = {
        champions: { title: '🏆 National Champions', rows: dynasty.championshipHistory || [], format: r => `**Season ${r.season} (${yearFor(r)})** — 🏆 **${r.champion || 'Champion not recorded'}**${r.runnerUp ? ` · Runner-up: ${r.runnerUp}` : ''}${r.championScore !== null && r.championScore !== undefined ? ` · ${r.championScore}–${r.runnerUpScore ?? '—'}` : ''}` },
        conferences: { title: '🏅 Conference Champions', rows: dynasty.conferenceChampionsHistory || [], format: r => `**Season ${r.season} (${yearFor(r)}) · ${r.conference || 'Conference'}** — **${r.champion || r.team || r.winner || 'Winner not recorded'}**${r.runnerUp ? ` · Runner-up: ${r.runnerUp}` : ''}` },
        heisman: { title: '🎖️ Heisman Trophy Winners', rows: dynasty.heismanHistory || [], format: r => `**Season ${r.season} (${yearFor(r)})** — **${r.winner || r.player || r.recipient || 'Winner not recorded'}**${r.team ? ` · ${r.team}` : ''}${r.detail ? ` · ${r.detail}` : ''}` },
        awards: { title: '🏵️ Other Award Winners', rows: dynasty.awardHistory || [], format: r => `**Season ${r.season} (${yearFor(r)}) · ${r.award || r.type || 'Award'}** — **${r.winner || r.player || r.recipient || 'Winner not recorded'}**${r.team ? ` · ${r.team}` : ''}${r.detail ? ` · ${r.detail}` : ''}` },
        records: { title: '📈 Records & Honors', rows: dynasty.recordHistory || [], format: r => `**Season ${r.season} (${yearFor(r)}) · ${r.category || r.record || 'Record'}** — **${r.holder || r.recipient || r.team || 'Not recorded'}**${r.value ? ` · ${r.value}` : ''}${r.detail ? ` · ${r.detail}` : ''}` },
        draft: { title: '🏈 Drafted Players', rows: dynasty.draftHistory || [], format: r => `**Season ${r.season} (${yearFor(r)})** — **${r.player || r.winner || 'Player not recorded'}**${r.team ? ` · ${r.team}` : ''}${r.detail ? ` · ${r.detail}` : ''}` },
        archives: { title: '🗂️ Season Archives', rows: dynasty.seasonArchives || [], format: r => `**Season ${r.season} (${yearFor(r)})**${r.champion ? ` — 🏆 ${r.champion}` : ''}${r.runnerUp ? ` · Runner-up: ${r.runnerUp}` : ''}${r.status ? ` · ${r.status}` : ''}` }
    };
    const selected = config[category];
    if (!selected) return buildHistoryPanelEmbed(dynasty);
    const rows = [...selected.rows].sort((a, b) => Number(b.season) - Number(a.season));
    const lines = rows.map(selected.format);
    const description = lines.length ? lines.slice(0, 35).join('\n').slice(0, 4000) : 'No records in this category yet. League staff can add missing history with `/league history-record`.';
    return new EmbedBuilder().setColor(0x243447).setTitle(`${dynasty.name} · ${selected.title}`)
        .setDescription(description)
        .setFooter({ text: `${rows.length} historical record(s) · BLACKLINE League History` }).setTimestamp(new Date());
}

async function refreshHistoryPanel(client, dynasty) {
    try {
        const target = await recoverPanelTarget(client, dynasty, {
            channelKey: 'historyChannelId', messageKey: 'historyMessageId',
            channelNamePattern: /league[-・ ]?history/i,
            matchesMessage: message => message.embeds?.some(embed => embed.title === `📚 ${dynasty.name} · Complete League History`)
        });
        if (!target.channel || !target.message) return false;
        await target.message.edit({ embeds: [buildHistoryPanelEmbed(dynasty)], components: buildHistoryPanelButtons(dynasty.id), allowedMentions: { parse: [] } });
        dynasty.historyChannelId = target.channel.id;
        dynasty.historyMessageId = target.message.id;
        if (target.recovered) persistPanelReferences(dynasty, ['historyChannelId', 'historyMessageId']);
        return true;
    } catch (error) {
        console.error(`Could not refresh history panel for ${dynasty.name}:`, error);
        return false;
    }
}

function buildCompetitionPanelButtons(dynastyId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_standings:${dynastyId}`).setLabel('Standings').setEmoji('📊').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_schedule:${dynastyId}`).setLabel('Schedule & Results').setEmoji('📅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_rankings:${dynastyId}`).setLabel('Rankings').setEmoji('🏈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_champions:${dynastyId}`).setLabel('Champions').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_refresh:${dynastyId}`).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynastyId}`).setLabel('Playoff Bracket').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_report-score:${dynastyId}`).setLabel('Report Score').setEmoji('📝').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_roster:${dynastyId}`).setLabel('Team Rosters').setEmoji('👥').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_activity:${dynastyId}`).setLabel('Activity Feed').setEmoji('📰').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting:${dynastyId}`).setLabel('Recruiting Class').setEmoji('⭐').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_rivalries:${dynastyId}`).setLabel('Rivalry Tracker').setEmoji('🔥').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_signing-day:${dynastyId}`).setLabel('Signing Day').setEmoji('✍️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_power-rankings:${dynastyId}`).setLabel('Power Rankings').setEmoji('📈').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_upsets:${dynastyId}`).setLabel('Upset Tracker').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-recap:${dynastyId}`).setLabel('Weekly Recap').setEmoji('🗞️').setStyle(ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_storylines:${dynastyId}`).setLabel('Season Storylines').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-awards:${dynastyId}`).setLabel('Weekly Awards').setEmoji('🏅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_coach-of-year:${dynastyId}`).setLabel('Coach of the Year Race').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_conference-race:${dynastyId}`).setLabel('Conference Race').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_record-book:${dynastyId}`).setLabel('Record Book').setEmoji('📖').setStyle(ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-picture:${dynastyId}`).setLabel('Playoff Picture').setEmoji('🫧').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-scenarios:${dynastyId}`).setLabel('What-If Scenarios').setEmoji('🔮').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-clinching:${dynastyId}`).setLabel('Clinching Tracker').setEmoji('🎟️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-history:${dynastyId}`).setLabel('Bracket History').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-records:${dynastyId}`).setLabel('Playoff Records').setEmoji('📈').setStyle(ButtonStyle.Primary)
        )
    ];
}
async function handleCoachProfileModal(interaction) {
    const [, dynastyId] = interaction.customId.split(':');
    const database = loadDatabase();
    const dynasty = database.dynasties.find(item => item.id === dynastyId && item.status === 'active');
    if (!dynasty) return interaction.reply({ content: '❌ This dynasty could not be found.', ephemeral: true });
    if (!(dynasty.coaches || []).some(coach => coach.userId === interaction.user.id)) {
        return interaction.reply({ content: '❌ Only registered coaches can edit a coach profile.', ephemeral: true });
    }
    const profile = coachProfileData(dynasty, interaction.user.id);
    profile.title = interaction.fields.getTextInputValue('title').trim();
    profile.bio = interaction.fields.getTextInputValue('bio').trim();
    profile.philosophy = interaction.fields.getTextInputValue('philosophy').trim();
    profile.updatedAt = new Date().toISOString();
    saveDatabase(database);
    const coach = dynasty.coaches.find(item => item.userId === interaction.user.id);
    const channel = dynasty.coachCenterChannelId ? await interaction.client.channels.fetch(dynasty.coachCenterChannelId).catch(() => null) : null;
    const panel = channel?.isTextBased() && dynasty.coachCenterMessageId ? await channel.messages.fetch(dynasty.coachCenterMessageId).catch(() => null) : null;
    if (panel) await panel.edit({ embeds: [coachPanelEmbed(dynasty, 0)], components: coachPanelComponents(dynasty, 0), allowedMentions: { parse: [] } }).catch(() => {});
    return interaction.reply({ embeds: [coachProfileEmbed(dynasty, coach)], content: '✅ Your coach profile has been saved.', ephemeral: true, allowedMentions: { parse: [] } });
}

async function handleCoachComponent(interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[0];
    const database = loadDatabase();
    const dynasty = database.dynasties.find(item => item.id === parts[1] && item.status === 'active');
    if (!dynasty) return interaction.reply({ content: '❌ This dynasty could not be found.', ephemeral: true });
    if (action === 'blackline_coach_edit') {
        if (!(dynasty.coaches || []).some(coach => coach.userId === interaction.user.id)) return interaction.reply({ content: '❌ You must be a registered coach in this dynasty to edit a profile.', ephemeral: true });
        return interaction.showModal(coachProfileModal(dynasty.id, (dynasty.coachProfiles || {})[interaction.user.id] || {}));
    }
    if (interaction.isButton()) {
        if (action === 'blackline_coach_legacy') {
            return interaction.reply({ embeds: [coachLegacyLeaderboardEmbed(dynasty)], ephemeral: true, allowedMentions: { parse: [] } });
        }
        if (action === 'blackline_coach_movement') {
            const coachId = parts[2];
            const coach = (dynasty.coaches || []).find(item => item.userId === coachId);
            if (!coach) return interaction.reply({ content: 'That coach is no longer registered in this dynasty.', ephemeral: true });
            const history = buildCoachMovementHistory(dynasty, coachId);
            const lines = history.tenures.map((tenure, index) => {
                const record = tenure.wins === null || tenure.losses === null ? 'record not entered' : `${tenure.wins}-${tenure.losses}${tenure.ties ? `-${tenure.ties}` : ''}`;
                return `**${index + 1}. ${tenure.team}** — Seasons ${tenure.startSeason}${tenure.endSeason !== tenure.startSeason ? `–${tenure.endSeason}` : ''} · ${record}`;
            });
            const moves = history.transitions.map(move => `• **${move.from} → ${move.to}** — recorded start Season ${move.startSeason}${move.overlap ? ' ⚠️ overlapping tenure' : ''}`);
            const conflicts = history.overlapping.map(row => `• ${row.first} / ${row.second} overlap in Season${row.startSeason === row.endSeason ? '' : 's'} ${row.startSeason}${row.startSeason !== row.endSeason ? `–${row.endSeason}` : ''}`);
            const embed = new EmbedBuilder().setColor(0x243447)
                .setTitle(`🔄 ${dynasty.name} · ${coach.username || 'Coach'} — Job History`)
                .setDescription([`**Recorded tenures**\n${lines.join('\n') || 'No coaching tenures recorded yet. Staff can record them with `/league coach-career`.'}`, `**Program changes**\n${moves.join('\n') || 'No program changes can be established from recorded tenures.'}`, conflicts.length ? `**Review overlapping records**\n${conflicts.join('\n')}` : 'No overlapping cross-program tenure ranges detected.', `**Data note**\n${history.note}`].join('\n\n').slice(0, 4000))
                .setFooter({ text: `${history.totalPrograms} distinct program(s) · Recorded history only` });
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`blackline_coach_movement:${dynasty.id}:${coachId}`).setLabel('Refresh Job History').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`blackline_coach_legacy:${dynasty.id}`).setLabel('Legacy Rankings').setEmoji('🏛️').setStyle(ButtonStyle.Success)
            );
            return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
        }
        if (action === 'blackline_coach_hall-of-fame') {
            const hall = buildCoachHallOfFame(dynasty, { getCareerStats: userId => coachCareerStats(dynasty, userId) });
            const lines = hall.coaches.slice(0, 12).map(row => {
                const s = row.stats;
                const record = `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`;
                return `**${row.rank}. ${row.name}** — ${row.legacy.tier} · **${row.legacy.score} pts**\n${record} · ${s.games ? `${s.winPercentage.toFixed(1)}%` : 'N/A'} win rate · ${s.nationalTitles} national title(s) · ${s.conferenceTitles} conference title(s)`;
            });
            const milestoneLeaders = hall.coaches.slice().sort((a, b) => b.stats.nationalTitles - a.stats.nationalTitles || b.stats.conferenceTitles - a.stats.conferenceTitles || a.name.localeCompare(b.name)).slice(0, 5)
                .map(row => `• **${row.name}** — ${row.stats.nationalTitles} national title(s), ${row.stats.conferenceTitles} conference title(s), ${row.stats.heismanWinners} Heisman winner(s), ${row.stats.draftedPlayers} drafted player(s)`);
            const embed = new EmbedBuilder().setColor(0x7C3AED)
                .setTitle(`🏛️ ${dynasty.name} · All-Time Coaching Hall of Fame`)
                .setDescription([`**Career legacy leaderboard**\n${lines.join('\n\n') || 'No registered coaches are available yet.'}`, `**Achievement leaders**\n${milestoneLeaders.join('\n') || 'No coaching achievements have been recorded yet.'}`, `**Scoring**\n${hall.scoring}`, `**Data note**\n${hall.note}`].join('\n\n').slice(0, 4000))
                .setFooter({ text: `${hall.coachesReviewed} registered coach(es) reviewed · ${hall.inductedCount} at Hall of Fame tier · Read-only` });
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`blackline_coach_hall-of-fame:${dynasty.id}`).setLabel('Refresh Hall of Fame').setEmoji('🔄').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`blackline_coach_legacy:${dynasty.id}`).setLabel('Legacy Rankings').setEmoji('🏛️').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
        }
        const currentPage = Number(parts[3]) || 0;
        const page = action === 'blackline_coach_page' ? (parts[2] === 'next' ? currentPage + 1 : Math.max(0, currentPage - 1)) : Number(parts[2]) || 0;
        if (action === 'blackline_coach_page' || action === 'blackline_coach_refresh') {
            await interaction.deferUpdate();
            return interaction.editReply({ embeds: [coachPanelEmbed(dynasty, page)], components: coachPanelComponents(dynasty, page), allowedMentions: { parse: [] } });
        }
    }
    if (interaction.isStringSelectMenu() && action === 'blackline_coach_select') {
        const userId = interaction.values[0];
        if (userId === '__none__') return interaction.reply({ content: 'No registered coaches are available to view yet.', ephemeral: true });
        const coach = (dynasty.coaches || []).find(item => item.userId === userId);
        if (!coach) return interaction.reply({ content: '❌ That coach is no longer registered in this dynasty.', ephemeral: true });
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`blackline_coach_edit:${dynasty.id}`).setLabel('Edit My Profile').setStyle(ButtonStyle.Primary).setEmoji('✏️'), new ButtonBuilder().setCustomId(`blackline_coach_movement:${dynasty.id}:${coach.userId}`).setLabel('Job History').setStyle(ButtonStyle.Secondary).setEmoji('🔄'));
        return interaction.reply({ embeds: [coachProfileEmbed(dynasty, coach)], components: [row], ephemeral: true, allowedMentions: { parse: [] } });
    }
}

async function handleCompetitionButton(interaction) {
    const isHistoryButton = interaction.customId.startsWith('blackline_history_');
    const [action, dynastyId] = isHistoryButton
        ? interaction.customId.replace('blackline_history_', '').split(':')
        : interaction.customId.replace('blackline_competition_', '').split(':');
    const database = loadDatabase();
    const dynasty = database.dynasties.find(d => d.id === dynastyId && d.status === 'active');
    if (!dynasty) return interaction.reply({ content: 'This competition panel is no longer connected to an active league.', ephemeral: true });
    ensureLeagueData(dynasty);
    ensureRosterData(dynasty);
    if (!isHistoryButton && action === 'conference-race') {
        const race = buildConferenceChampionshipRace(dynasty, { season: dynasty.season });
        const sections = race.races.map(group => {
            const leader = group.leader;
            const title = `**${group.conference}**`;
            const status = group.recordedChampion ? `Recorded Season ${race.season} champion: **${group.recordedChampion}**` :
                group.hasRecordedConferenceResults ? `Race leader: **${leader?.team || 'Undetermined'}**${group.tiedAtTop ? ' · Top position tied on current tiebreakers' : ''}` :
                'No finalized conference games recorded yet';
            const rows = group.standings.slice(0, 8).map((row, index) =>
                `**${index + 1}. ${row.team}** — ${row.record} conf. (${(row.conferenceWinPercentage * 100).toFixed(1)}%) · Overall ${row.overallRecord} · ${row.remainingConferenceGames} scheduled conf. game(s) left`);
            const omitted = group.standings.length > 8 ? `\n…and ${group.standings.length - 8} more team(s)` : '';
            return `${title}\n${status} · ${group.scheduledConferenceGamesRemaining} scheduled conference game(s) remaining\n${rows.join('\n') || 'No assigned teams found.'}${omitted}`;
        });
        const embed = new EmbedBuilder().setColor(0x1D4ED8)
            .setTitle(`🏆 ${dynasty.name} · Season ${race.season} Conference Championship Race`)
            .setDescription((sections.join('\n\n') || 'No conferences are assigned yet. League staff can assign teams with `/league conference-set`.').slice(0, 4000))
            .setFooter({ text: `${race.gamesConsidered} finalized game(s) reviewed · Uses saved conference assignments and schedule · No clinching inferred from incomplete schedules` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_conference-race:${dynasty.id}`).setLabel('Refresh Race').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_standings:${dynasty.id}`).setLabel('Overall Standings').setEmoji('📊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_schedule:${dynasty.id}`).setLabel('Schedule & Results').setEmoji('📅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_championship-weekend:${dynasty.id}`).setLabel('Championship Weekend').setEmoji('🏟️').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'championship-weekend') {
        const weekend = buildChampionshipWeekend(dynasty, { season: dynasty.season });
        const gameLines = weekend.championshipGames.map(game => {
            const matchup = `**${game.awayTeam}**${game.status === 'final' || game.status === 'tie' ? ` ${game.awayScore}` : ''} @ **${game.homeTeam}**${game.status === 'final' || game.status === 'tie' ? ` ${game.homeScore}` : ''}`;
            const result = game.status === 'final' ? ` — 🏆 ${game.winner}` : game.status === 'tie' ? ' — Final tie' : ` — ${game.status}`;
            return `• ${game.conference ? `**${game.conference}:** ` : ''}${matchup}${result}${game.week !== null ? ` · Week ${game.week}` : ''}`;
        });
        const titleLines = weekend.recordedTitles.map(row => `• **${row.conference}: ${row.champion}**${row.runnerUp ? ` over ${row.runnerUp}` : ''}${row.score ? ` (${row.score})` : ''}`);
        const embed = new EmbedBuilder().setColor(0xB45309)
            .setTitle(`🏟️ ${dynasty.name} · Season ${weekend.season} Championship Weekend Center`)
            .setDescription([
                `**Conference championship matchups (${weekend.championshipGames.length})**\n${gameLines.join('\n') || 'No explicitly tagged conference championship games are recorded for this season.'}`,
                `**Recorded conference champions (${weekend.recordedTitles.length})**\n${titleLines.join('\n') || 'No conference champions have been explicitly recorded for this season.'}`,
                `**Data coverage**\n${weekend.finalizedChampionshipGames} finalized championship game(s) · ${weekend.scheduledChampionshipGames} not finalized`,
                `**Data note**\n${weekend.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Read-only championship overview · Results must be recorded through league management' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_championship-weekend:${dynasty.id}`).setLabel('Refresh Center').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_conference-race:${dynasty.id}`).setLabel('Conference Race').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-picture:${dynasty.id}`).setLabel('Playoff Picture').setEmoji('🫧').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynasty.id}`).setLabel('Playoff Bracket').setEmoji('🏈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_champions:${dynasty.id}`).setLabel('National Champions').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_national-championship:${dynasty.id}`).setLabel('Title Game Experience').setEmoji('🎆').setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'national-championship') {
        const title = buildNationalChampionshipExperience(dynasty, { season: dynasty.season });
        const gameLines = title.games.map(game => {
            const score = game.status === 'final' || game.status === 'tie' ? ` ${game.awayScore}–${game.homeScore}` : '';
            const outcome = game.status === 'final' ? ` · 🏆 **${game.champion}** defeats ${game.runnerUp}` : game.status === 'tie' ? ' · Final tie' : ` · ${game.status}`;
            return `• **${game.awayTeam} @ ${game.homeTeam}**${score}${outcome}${game.week !== null ? ` · Week ${game.week}` : ''}`;
        });
        const historyLines = title.history.map(row => `• 🏆 **${row.champion}**${row.runnerUp ? ` over ${row.runnerUp}` : ''}${row.score ? ` (${row.score})` : ''} · Season ${row.season}`);
        const description = [
            `**National Championship Game · Season ${title.season}**\n${gameLines.join('\n') || 'No explicitly tagged national championship game is recorded for this season.'}`,
            `**Official title history**\n${historyLines.join('\n') || 'No national champion has been explicitly recorded for this season.'}`,
            `**Championship snapshot**\n${title.finalizedGames.length} valid final game(s) recorded${title.latest ? ` · Latest recorded champion: **${title.latest.champion}**` : ''}`,
            `**Data integrity**\n${title.note}`
        ].join('\n\n').slice(0, 4000);
        const embed = new EmbedBuilder().setColor(0xB91C1C)
            .setTitle(`🏆 ${dynasty.name} · National Championship Experience`)
            .setDescription(description)
            .setFooter({ text: 'Read-only title-game presentation · Official results are managed through existing league records' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_national-championship:${dynasty.id}`).setLabel('Refresh Title Game').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_champions:${dynasty.id}`).setLabel('Champions History').setEmoji('📚').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_championship-weekend:${dynasty.id}`).setLabel('Championship Weekend').setEmoji('🏟️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynasty.id}`).setLabel('Playoff Bracket').setEmoji('🏈').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (isHistoryButton && action === 'dynasty-almanac') {
        const almanac = buildDynastyAlmanac(dynasty);
        const c = almanac.coverage, h = almanac.highlights;
        const champion = h.latestChampion ? `**${h.latestChampion.team}** · Season ${h.latestChampion.season}` : 'No national champion is recorded.';
        const program = h.allTimeProgramLeader ? `**${h.allTimeProgramLeader.team}** · ${h.allTimeProgramLeader.wins}-${h.allTimeProgramLeader.losses}${h.allTimeProgramLeader.ties ? `-${h.allTimeProgramLeader.ties}` : ''}` : 'No finalized program records are available.';
        const award = h.mostDecoratedRecipient ? `**${h.mostDecoratedRecipient.name}** · ${h.mostDecoratedRecipient.honors} recorded honor(s)` : 'No valid award recipients are recorded.';
        const programHall = h.topProgramHall ? `**${h.topProgramHall.team}** · rank ${h.topProgramHall.rank ?? '—'}${Number.isFinite(Number(h.topProgramHall.points)) ? ` · ${Number(h.topProgramHall.points).toFixed(1)} pts` : ''}` : 'No program Hall of Fame entries are available.';
        const coachHall = h.topCoachHall ? `**${h.topCoachHall.name}** · rank ${h.topCoachHall.rank ?? '—'}${Number.isFinite(Number(h.topCoachHall.points)) ? ` · ${Number(h.topCoachHall.points).toFixed(1)} pts` : ''}` : 'No coaching Hall of Fame entries are available.';
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`📚 ${dynasty.name} · BLACKLINE Dynasty Almanac`)
            .setDescription([
                `**Historical coverage**\n${c.programs} program(s) · ${c.finalizedGames} finalized game(s) · ${c.seasons} recorded season(s) · ${c.nationalTitles} national title(s) · ${c.conferenceTitles} conference title(s)`,
                `**Player & coach history**\n${c.awardRecords} valid award record(s) · ${c.playerCareerRecords} player career source record(s) · ${c.draftRecords} draft record(s) · ${c.coachHallEntries} coaching Hall of Fame entry/entries`,
                `**Recruiting & program legacy**\n${c.recruitingClassRecords} recruiting archive record(s) · ${c.programHallEntries} program Hall of Fame entry/entries`,
                `**Almanac highlights**\nLatest recorded national champion: ${champion}\nAll-time wins leader: ${program}\nMost decorated award recipient: ${award}\nProgram Hall of Fame leader: ${programHall}\nCoaching Hall of Fame leader: ${coachHall}`,
                `**How to use this hub**\nChoose a button below to open an existing history feature. The Almanac summarizes saved records and does not replace or duplicate their source systems.`,
                `**Data integrity**\n${almanac.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Read-only historical index · All counts depend on saved league data' }).setTimestamp(new Date());
        const rows = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`blackline_competition_record-book:${dynasty.id}`).setLabel('Record Book').setEmoji('📖').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`blackline_competition_program-hall-of-fame:${dynasty.id}`).setLabel('Program Hall of Fame').setEmoji('🏛️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`blackline_coach_hall-of-fame:${dynasty.id}`).setLabel('Coaching Hall of Fame').setEmoji('🎓').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`blackline_history_award-leaders:${dynasty.id}`).setLabel('Award Leaders').setEmoji('🏆').setStyle(ButtonStyle.Success)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`blackline_history_player-careers:${dynasty.id}`).setLabel('Player Careers').setEmoji('🏈').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`blackline_competition_recruiting-archive:${dynasty.id}`).setLabel('Recruiting Archive').setEmoji('📝').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`blackline_competition_program-evolution:${dynasty.id}`).setLabel('Dynasty Timeline').setEmoji('📜').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`blackline_history_dynasty-almanac:${dynasty.id}`).setLabel('Refresh Almanac').setEmoji('🔄').setStyle(ButtonStyle.Success)
            )
        ];
        return interaction.reply({ embeds: [embed], components: rows, ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'record-book') {
        const book = buildDynastyRecordBook(dynasty);
        const record = row => `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
        const careerLines = book.careerLeaders.slice(0, 7).map((row, index) =>
            `**${index + 1}. ${row.team}** — ${record(row)} · ${row.winPercentage.toFixed(1)}% · ${row.pointDifferential >= 0 ? '+' : ''}${row.pointDifferential} diff.`);
        const seasonLines = book.seasonRecords.slice(0, 5).map(row =>
            `• **${row.team} · Season ${row.season}** — ${record(row)} · ${row.wins} win(s) · ${row.pointDifferential >= 0 ? '+' : ''}${row.pointDifferential} diff.`);
        const scoringLines = book.singleGameScoring.slice(0, 5).map(row =>
            `• **${row.team}** scored ${row.points} vs. ${row.opponent} (${row.opponentPoints}) · Season ${row.season}${row.week !== null ? `, Week ${row.week}` : ''}`);
        const marginLines = book.largestWins.slice(0, 5).map(row =>
            `• **${row.winner} ${row.winnerScore}–${row.loserScore} ${row.loser}** · +${row.margin} · Season ${row.season}${row.week !== null ? `, Week ${row.week}` : ''}`);
        const highGameLines = book.highestScoringGames.slice(0, 5).map(row =>
            `• **${row.homeTeam} ${row.homeScore}–${row.awayScore} ${row.awayTeam}** · ${row.totalPoints} total · Season ${row.season}${row.week !== null ? `, Week ${row.week}` : ''}`);
        const titleLines = book.championshipLeaders.slice(0, 5).map((row, index) =>
            `• **${index + 1}. ${row.team}** — ${row.nationalTitles} national title(s) · ${row.conferenceTitles} conference title(s)`);
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`📖 ${dynasty.name} · Dynasty Record Book`)
            .setDescription([
                `**All-time program records**\n${careerLines.join('\n') || 'No finalized schedule results are recorded yet.'}`,
                `**Best season records**\n${seasonLines.join('\n') || 'No completed team seasons can be calculated yet.'}`,
                `**Most points in one game**\n${scoringLines.join('\n') || 'No valid finalized scores are available.'}`,
                `**Largest winning margins**\n${marginLines.join('\n') || 'No decisive finalized games are available.'}`,
                `**Highest-scoring games**\n${highGameLines.join('\n') || 'No valid finalized games are available.'}`,
                `**Recorded championship leaders**\n${titleLines.join('\n') || 'No championship history has been recorded.'}`,
                `**Coverage note**\n${book.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${book.gamesReviewed} finalized schedule game(s) · ${book.seasonsReviewed} season(s) reviewed · Read-only records` })
            .setTimestamp(new Date());
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_record-book:${dynasty.id}`).setLabel('Refresh Record Book').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_program-hall-of-fame:${dynasty.id}`).setLabel('Program Hall of Fame').setEmoji('🏛️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-records:${dynasty.id}`).setLabel('Playoff Records').setEmoji('🏈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_dynasty-almanac:${dynasty.id}`).setLabel('Dynasty Almanac').setEmoji('📚').setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-records') {
        const records = buildPlayoffPerformanceRecords(dynasty);
        const teamLines = records.teamRecords.slice(0, 8).map((row, index) =>
            `**${index + 1}. ${row.team}** — ${row.wins}-${row.losses} · ${row.playoffAppearances} appearance(s) · ${row.championships} title(s) · ${row.pointDifferential >= 0 ? '+' : ''}${row.pointDifferential} point diff.`);
        const runLines = records.mostSuccessfulRuns.slice(0, 5).map(row =>
            `• **${row.team} · Season ${row.season}** — ${row.wins}-${row.losses} in ${row.games} game(s) · ${row.pointDifferential >= 0 ? '+' : ''}${row.pointDifferential} point diff.`);
        const winLines = records.largestWins.slice(0, 5).map(row =>
            `• **${row.winner}** def. ${row.loser} ${row.homeScore}-${row.awayScore} · +${row.margin} · Season ${row.season}, ${row.round}`);
        const scoringLines = records.mostPointsByTeam.slice(0, 5).map(row =>
            `• **${row.team}** scored ${row.points} vs. ${row.opponent} (${row.opponentPoints}) · Season ${row.season}, ${row.round}`);
        const highGameLines = records.highestScoringGames.slice(0, 5).map(row =>
            `• **${row.homeTeam} ${row.homeScore}–${row.awayScore} ${row.awayTeam}** · ${row.totalPoints} total points · Season ${row.season}, ${row.round}`);
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`📈 ${dynasty.name} · Playoff Performance Records`)
            .setDescription([
                `**All-time playoff team records**\n${teamLines.join('\n') || 'No finalized playoff results are recorded.'}`,
                `**Best single-season playoff runs**\n${runLines.join('\n') || 'No completed team playoff runs can be calculated yet.'}`,
                `**Largest playoff wins**\n${winLines.join('\n') || 'No valid finalized playoff scores are available.'}`,
                `**Most points by a team in one playoff game**\n${scoringLines.join('\n') || 'No valid finalized playoff scores are available.'}`,
                `**Highest-scoring playoff games**\n${highGameLines.join('\n') || 'No valid finalized playoff scores are available.'}`,
                `**Data note**\n${records.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${records.seasonsReviewed} bracket(s) reviewed · ${records.finalizedGames} finalized game(s) · Read-only records` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-records:${dynasty.id}`).setLabel('Refresh Records').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-history:${dynasty.id}`).setLabel('Bracket History').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynasty.id}`).setLabel('Current Bracket').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_program-hall-of-fame:${dynasty.id}`).setLabel('Program Hall of Fame').setEmoji('🏛️').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'program-evolution') {
        const programs = buildProgramEvolutionIndex(dynasty);
        if (!programs.length) return interaction.reply({ content: 'No program names are available in recorded league data yet.', ephemeral: true });
        const ranked = programs.slice().sort((a, b) => (b.nationalTitles * 5 + b.conferenceTitles * 2 + b.awards) - (a.nationalTitles * 5 + a.conferenceTitles * 2 + a.awards) || b.overall.wins - a.overall.wins || a.team.localeCompare(b.team));
        const programLines = ranked.slice(0, 12).map((row, index) => {
            const best = row.bestSeason ? ` · best season ${row.bestSeason.season} (${row.bestSeason.wins}-${row.bestSeason.losses}${row.bestSeason.ties ? `-${row.bestSeason.ties}` : ''})` : '';
            return `**${index + 1}. ${row.team}** — ${row.overall.wins}-${row.overall.losses}${row.overall.ties ? `-${row.overall.ties}` : ''} · ${row.seasonsReviewed} season(s) · 🏆 ${row.nationalTitles} national · 🏅 ${row.conferenceTitles} conference · 🏵️ ${row.awards} award(s)${best}`;
        });
        const events = programs.flatMap(row => row.timeline.map(event => ({ ...event, team: row.team })))
            .sort((a, b) => b.season - a.season || a.team.localeCompare(b.team) || a.type.localeCompare(b.type)).slice(0, 14)
            .map(event => `• **Season ${event.season} · ${event.team} — ${event.type}:** ${event.detail}`);
        const totals = programs.reduce((acc, row) => ({ games: acc.games + row.gamesReviewed, seasons: acc.seasons + row.seasonsReviewed, national: acc.national + row.nationalTitles, conference: acc.conference + row.conferenceTitles, awards: acc.awards + row.awards }), { games: 0, seasons: 0, national: 0, conference: 0, awards: 0 });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`📜 ${dynasty.name} · Program Evolution & Dynasty Timeline`)
            .setDescription([`**Program snapshots**\n${programLines.join('\n') || 'No program history has been recorded yet.'}`, `**Recent recorded milestones**\n${events.join('\n') || 'No finalized season records or explicit honors are available yet.'}`, `**League-wide coverage**\n${programs.length} program(s) · ${totals.seasons} team-season record(s) · ${totals.games} finalized game(s) · ${totals.national} national title record(s) · ${totals.conference} conference title record(s) · ${totals.awards} award record(s)`, `**Data note**\nTimelines use finalized game scores and explicitly recorded honors. Missing seasons, championships, and milestones are not inferred.`].join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Read-only historical overview · Rankings summarize recorded data, not inferred prestige' }).setTimestamp(new Date());
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_program-evolution:${dynasty.id}`).setLabel('Refresh Timeline').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_program-hall-of-fame:${dynasty.id}`).setLabel('Program Hall of Fame').setEmoji('🏛️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_record-book:${dynasty.id}`).setLabel('Record Book').setEmoji('📖').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'program-hall-of-fame') {
        const hall = buildProgramHallOfFame(dynasty);
        const lines = hall.programs.slice(0, 10).map(row =>
            `**${row.rank}. ${row.team}** — **${row.points.toFixed(1)} pts** · ${row.overallRecord.wins}-${row.overallRecord.losses}${row.overallRecord.ties ? `-${row.overallRecord.ties}` : ''} overall · ${row.nationalTitles} national title(s) · ${row.conferenceTitles} conference title(s) · ${row.playoffAppearances} playoff appearance(s)`);
        const honors = hall.programs.slice().sort((a, b) => b.nationalTitles - a.nationalTitles || b.conferenceTitles - a.conferenceTitles || a.team.localeCompare(b.team)).slice(0, 5)
            .map(row => `• **${row.team}** — ${row.nationalTitles} national title(s), ${row.conferenceTitles} conference title(s), ${row.heismanWinners} Heisman winner(s), ${row.draftPicks} draft pick(s)`);
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`🏛️ ${dynasty.name} · All-Time Program Hall of Fame`)
            .setDescription([
                `**Program prestige leaderboard**\n${lines.join('\n') || 'No program history has been recorded yet.'}`,
                `**Recorded honors leaders**\n${honors.join('\n') || 'No program honors have been recorded yet.'}`,
                `**Scoring formula**\n${hall.scoring}`,
                `**Data note**\n${hall.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${hall.programsReviewed} program(s) reviewed · ${hall.seasonsReviewed} playoff bracket(s) reviewed · Read-only` })
            .setTimestamp(new Date());
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_program-hall-of-fame:${dynasty.id}`).setLabel('Refresh Hall of Fame').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_history_stats:${dynasty.id}`).setLabel('All-Time Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-records:${dynasty.id}`).setLabel('Playoff Records').setEmoji('📈').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-history') {
        const history = buildPlayoffHistory(dynasty);
        const seasonLines = history.seasons.slice(0, 10).map(row => `**Season ${row.season}**${row.champion ? ` — 🏆 ${row.champion}` : ''} · ${row.finalizedGames} finalized playoff game(s) · ${row.status}`);
        const rematchLines = history.rematches.slice(0, 8).map(row => `• **${row.homeTeam} vs. ${row.awayTeam}** · ${row.round} · previously met in Season(s) ${row.previousSeasons.join(', ')}`);
        const seriesLines = history.repeatSeries.slice(0, 8).map(row => `• **${row.teams[0]} vs. ${row.teams[1]}** · ${row.meetings} bracket meetings · Seasons ${row.seasons.join(', ')}`);
        const recentLines = history.matchups.slice(0, 10).map(row => `• **Season ${row.season} · ${row.round}:** ${row.homeTeam} ${row.homeScore}–${row.awayScore} ${row.awayTeam} · ${row.winner} won`);
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`📚 ${dynasty.name} · Playoff Bracket History & Rematches`)
            .setDescription([
                `**Current-season rematches**\n${rematchLines.join('\n') || 'No current-bracket matchup has a recorded prior playoff meeting.'}`,
                `**Recurring playoff series**\n${seriesLines.join('\n') || 'No teams have multiple saved bracket meetings yet.'}`,
                `**Season archive**\n${seasonLines.join('\n') || 'No saved playoff brackets are available yet.'}`,
                `**Recent finalized bracket results**\n${recentLines.join('\n') || 'No finalized playoff results found in saved brackets.'}`,
                `**Data note**\n${history.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${history.bracketsAvailable} bracket(s) reviewed · ${history.totalMatchups} saved matchup(s) · Historical read-only view` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-history:${dynasty.id}`).setLabel('Refresh History').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynasty.id}`).setLabel('Current Bracket').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-picture:${dynasty.id}`).setLabel('Playoff Picture').setEmoji('🫧').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-clinching') {
        const tracker = buildPlayoffClinchingTracker(dynasty);
        const formatTeams = (rows, kind) => rows.slice(0, 8).map(row => {
            const extra = tracker.exact && kind === 'bubble' ? ` — in ${row.scenariosIn}/${row.totalScenarios} scenarios` : '';
            return `• **${row.team}**${extra}`;
        });
        const embed = new EmbedBuilder().setColor(tracker.exact ? 0x059669 : 0xD97706)
            .setTitle(`🎟️ ${dynasty.name} · Season ${tracker.season} Playoff Clinching Tracker`)
            .setDescription([
                `**Projected field**\n${tracker.projected.slice(0, 12).map(row => `${row.seed}. ${row.team}`).join('\n') || 'No teams available.'}`,
                `**Locked into the projected field across every modeled outcome**\n${tracker.exact ? (formatTeams(tracker.clinched, 'clinched').join('\n') || 'No team is locked into the field across every modeled outcome.') : 'Undetermined — remaining slate is too large for exhaustive enumeration.'}`,
                `**Still on the bubble**\n${tracker.exact ? (formatTeams(tracker.bubble, 'bubble').join('\n') || 'No bubble teams in the current candidate pool.') : 'All candidates remain undetermined.'}`,
                `**Outside the projected field across every modeled outcome**\n${tracker.exact ? (formatTeams(tracker.eliminated, 'eliminated').join('\n') || 'No team is outside the field across every modeled outcome.') : 'Elimination status undetermined.'}`,
                `**Method**\n${tracker.note}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: tracker.exact ? `${tracker.scenariosEvaluated} hypothetical outcomes evaluated · No official results or bracket changed` : `${tracker.remainingGames} games remain · No clinching/elimination claims made` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-clinching:${dynasty.id}`).setLabel('Refresh Tracker').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-picture:${dynasty.id}`).setLabel('Playoff Picture').setEmoji('🫧').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynasty.id}`).setLabel('Official Bracket').setEmoji('🏆').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-scenarios') {
        const games = getScenarioGames(dynasty);
        if (!games.length) return interaction.reply({ content: 'No unplayed games are available for the current season. Add scheduled games to the existing schedule to explore scenarios.', ephemeral: true, allowedMentions: { parse: [] } });
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`blackline_competition_playoff-scenarios-select:${dynasty.id}`)
            .setPlaceholder('Choose an unplayed game to simulate')
            .addOptions(games.map(item => ({ label: `${item.awayTeam} at ${item.homeTeam}`.slice(0, 100), description: `Week ${item.week || '?'} · ${item.status}`.slice(0, 100), value: String(item.index) })));
        const embed = new EmbedBuilder().setColor(0x6D28D9)
            .setTitle(`🔮 ${dynasty.name} · Playoff What-If Simulator`)
            .setDescription('Choose a scheduled game, then compare the projected field under a home win, away win, or tie. Each outcome uses an explicitly assumed score; this is a simple scenario comparison, not a probability forecast.')
            .setFooter({ text: 'Read-only simulation · Official results and bracket are never modified' });
        return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-scenarios-select' && interaction.isStringSelectMenu()) {
        const index = Number(interaction.values[0]);
        const game = getScenarioGames(dynasty, 25).find(item => item.index === index);
        if (!game) return interaction.reply({ content: 'That game is no longer available to simulate. Refresh the simulator and choose another scheduled game.', ephemeral: true, allowedMentions: { parse: [] } });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-scenario-result:${dynasty.id}:${index}:home-win`).setLabel(`${game.homeTeam} wins`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-scenario-result:${dynasty.id}:${index}:away-win`).setLabel(`${game.awayTeam} wins`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-scenario-result:${dynasty.id}:${index}:tie`).setLabel('Tie').setStyle(ButtonStyle.Secondary)
        );
        const embed = new EmbedBuilder().setColor(0x6D28D9).setTitle('Choose a hypothetical result')
            .setDescription(`**Week ${game.week || '?'}:** ${game.awayTeam} at ${game.homeTeam}\n\nThe simulator will assume 24–21 for a home win, 21–24 for an away win, or 21–21 for a tie. These scores are assumptions for comparison only.`);
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-scenario-result' && interaction.isButton()) {
        const result = simulatePlayoffScenario(dynasty, Number(parts[2]), parts[3]);
        if (!result.ok) return interaction.reply({ content: `Unable to simulate that result: ${result.error}`, ephemeral: true, allowedMentions: { parse: [] } });
        const lines = result.after.slice(0, 12).map(row => `**${row.seed}. ${row.team}**${row.bye ? ' · BYE' : ''} — ${row.bidType}`);
        const changes = [
            result.added.length ? `**Enters projected field:** ${result.added.join(', ')}` : '**Enters projected field:** None',
            result.removed.length ? `**Leaves projected field:** ${result.removed.join(', ')}` : '**Leaves projected field:** None'
        ];
        const embed = new EmbedBuilder().setColor(0x6D28D9)
            .setTitle(`🔮 What If? ${result.game.awayTeam} at ${result.game.homeTeam}`)
            .setDescription([`**Assumed outcome:** ${result.game.homeTeam} vs ${result.game.awayTeam} · ${result.assumedScore}`, `**Projected field under this scenario**\n${lines.join('\n') || 'No teams available.'}`, changes.join('\n'), result.note].join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Scenario only · No saved results or official bracket were changed' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-scenarios:${dynasty.id}`).setLabel('Try Another Scenario').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-picture:${dynasty.id}`).setLabel('Current Picture').setEmoji('🫧').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'playoff-picture') {
        const picture = buildPlayoffPicture(dynasty);
        const projectedLines = picture.projected.slice(0, 12).map(row => {
            const record = row.standing ? ` · ${row.standing.record}` : '';
            const remaining = row.standing ? ` · ${row.standing.remaining} scheduled` : '';
            return `**${row.seed}. ${row.team}**${row.bye ? ' · BYE' : ''} — ${row.bidType}${record}${remaining}`;
        });
        const bubbleLines = picture.bubble.map((row, index) => `**${index + 1}. ${row.team}**${row.standing ? ` — ${row.standing.record} · PD ${row.standing.pointDifferential > 0 ? '+' : ''}${row.standing.pointDifferential}` : ''}`);
        const embed = new EmbedBuilder().setColor(0x7C3AED)
            .setTitle(`🫧 ${dynasty.name} · Season ${picture.season} Playoff Picture & Bubble Watch`)
            .setDescription([
                `**Projected 12-team field**\n${projectedLines.join('\n') || 'No teams are available to project.'}`,
                `**On the bubble**\n${bubbleLines.join('\n') || 'No additional teams are currently listed outside the projected field.'}`,
                `**Context**\n${picture.notes}`
            ].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${picture.gamesConsidered} finalized games reviewed · ${picture.remainingGames} scheduled/unfinalized games · Projection only, not official qualification` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_playoff-picture:${dynasty.id}`).setLabel('Refresh Picture').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_playoffs:${dynasty.id}`).setLabel('Official Bracket').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_rankings:${dynasty.id}`).setLabel('Rankings').setEmoji('📈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_standings:${dynasty.id}`).setLabel('Standings').setEmoji('📊').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'weekly-awards') {
        const board = buildWeeklyLeagueAwards(dynasty, { season: dynasty.season });
        const a = board.awards;
        const gameLine = game => game ? `**${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore}**` : 'No qualifying finalized game.';
        const sections = [
            `**🏈 Game of the Week — Highest scoring**\n${gameLine(a.highestScoringGame)}${a.highestScoringGame ? ` · ${a.highestScoringGame.totalPoints} combined points` : ''}`,
            `**💥 Biggest Win**\n${a.biggestWin ? `${a.biggestWin.winner} won by ${a.biggestWin.margin} (${a.biggestWin.winnerScore}–${a.biggestWin.loserScore})` : 'No decisive finalized game.'}`,
            `**🎯 Closest Win**\n${a.closestWin ? `${a.closestWin.winner} won by ${a.closestWin.margin} (${a.closestWin.winnerScore}–${a.closestWin.loserScore})` : 'No decisive finalized game.'}`,
            `**📈 Top Scoring Winner**\n${a.topScoringWinner ? `${a.topScoringWinner.winner} scored ${a.topScoringWinner.winnerScore} points in a win over ${a.topScoringWinner.winner === a.topScoringWinner.homeTeam ? a.topScoringWinner.awayTeam : a.topScoringWinner.homeTeam}` : 'No winning result recorded.'}`,
            `**⚡ Upset of the Week**\n${a.upsetOfTheWeek ? `${a.upsetOfTheWeek.winner} (#${a.upsetOfTheWeek.winnerRank}) over ${a.upsetOfTheWeek.loser} (#${a.upsetOfTheWeek.loserRank}) · ${a.upsetOfTheWeek.score}` : 'No qualifying ranked upset recorded.'}`,
            `**🏅 Coach of the Week**\n${a.coachOfTheWeek ? `${a.coachOfTheWeek.coachName} · ${a.coachOfTheWeek.team} · ${a.coachOfTheWeek.pointsFor}–${a.coachOfTheWeek.pointsAgainst} vs ${a.coachOfTheWeek.opponent} · ${a.coachOfTheWeek.score.toFixed(2)} pts` : 'No eligible registered coach performance this week.'}`
        ];
        const embed = new EmbedBuilder().setColor(0x0F766E)
            .setTitle(`🏅 ${dynasty.name} · Season ${board.season} Week ${board.week} Weekly League Awards`)
            .setDescription([`**${board.gamesPlayed} finalized game(s) reviewed**`, ...sections, `**Data rules**\n${board.note}`].join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Calculated weekly honors · Not persisted as official awards · Read-only' }).setTimestamp();
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-awards:${dynasty.id}`).setLabel('Refresh Awards').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_coach-of-week:${dynasty.id}`).setLabel('Coach of the Week').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-recap:${dynasty.id}`).setLabel('Weekly Recap').setEmoji('🗞️').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'weekly-recap') {
        const recap = buildWeeklyRecap(dynasty);
        const resultLines = recap.results.slice(0, 12).map(game => `• **${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore}**${game.winner === 'Tie' ? ' · Tie' : ` · ${game.winner} won`}`);
        const upsetLines = recap.upsets.slice(0, 5).map(game => `• ⚡ **${game.winner}** (#${game.winnerRank}) over **${game.loser}** (#${game.loserRank}) · ${game.score}`);
        const rivalryLines = recap.rivalries.slice(0, 5).map(game => `• 🔥 **${game.teamA} vs ${game.teamB}** — ${game.winner} (${game.scoreA}–${game.scoreB})`);
        const recruitingLines = recap.recruitingMilestones.slice(0, 5).map(item => `• ${item.status === 'signed' ? '✍️ Signed' : '⭐ Committed'}: **${item.name}** (${item.position}, ${item.stars}★) → ${item.team}`);
        const movementLines = recap.rankingMovement.slice(0, 5).map(item => `• **${item.team}** ${item.movement > 0 ? `▲ ${item.movement}` : `▼ ${Math.abs(item.movement)}`} (#${item.previousRank} → #${item.rank})`);
        const sections = [
            `**Final Results (${recap.gamesPlayed})**\n${resultLines.join('\n') || 'No finalized games for this week.'}`,
            `**Upsets (${recap.upsets.length})**\n${upsetLines.join('\n') || 'No ranked upsets recorded.'}`,
            `**Rivalry Results (${recap.rivalries.length})**\n${rivalryLines.join('\n') || 'No tracked rivalry games this week.'}`,
            `**Recruiting Milestones (${recap.recruitingMilestones.length})**\n${recruitingLines.join('\n') || 'No recruiting events tagged to this week.'}`,
            `**Power Ranking Movement**\n${movementLines.join('\n') || (recap.hasPriorRanking ? 'No rank changes from the previous week.' : 'Movement appears after prior-week results exist.')}`
        ];
        const embed = new EmbedBuilder().setColor(0x0F766E)
            .setTitle(`🗞️ ${dynasty.name} · Season ${recap.season} Week ${recap.week} Recap`)
            .setDescription(sections.join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Built from finalized game records and explicit recruiting status history · Read-only summary' })
            .setTimestamp();
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-recap:${dynasty.id}`).setLabel('Refresh Recap').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_upsets:${dynasty.id}`).setLabel('Upsets').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_power-rankings:${dynasty.id}`).setLabel('Power Rankings').setEmoji('📈').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'coach-of-year') {
        const race = buildCoachOfYearRace(dynasty, { season: dynasty.season, limit: 10 });
        const lines = race.leaderboard.map((row, index) => {
            const record = `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
            return `**${index + 1}. ${row.coachName}** · ${row.team} — ${record} · **${row.racePoints.toFixed(2)} pts**\n${row.games} game(s) · Win rate ${(row.winPercentage * 100).toFixed(0)}% · PD ${row.pointDifferential > 0 ? '+' : ''}${row.pointDifferential} · ${row.strongerOpponentWins} win(s) vs ranked opponents`;
        });
        const embed = new EmbedBuilder().setColor(0xB45309)
            .setTitle(`🏆 ${dynasty.name} · Season ${race.season} Coach of the Year Race`)
            .setDescription(lines.join('\n\n').slice(0, 4000) || 'No registered coaches have finalized games recorded this season yet. Coaches must be registered and assigned to their teams.')
            .addFields({ name: 'Race Scoring', value: race.scoring, inline: false })
            .setFooter({ text: `${race.gamesCounted} finalized game(s) considered · Live cumulative race, not an official award` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_coach-of-year:${dynasty.id}`).setLabel('Refresh Race').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_coach-of-week:${dynasty.id}`).setLabel('Coach of the Week').setEmoji('🏅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_storylines:${dynasty.id}`).setLabel('Season Storylines').setEmoji('📚').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'coach-of-week') {
        const award = buildCoachOfWeek(dynasty, { season: dynasty.season });
        const winner = award.winner;
        const candidateLines = award.eligibleCandidates.slice(0, 5).map((row, index) =>
            `**${index + 1}. ${row.coachName}** · ${row.team} — ${row.pointsFor}–${row.pointsAgainst} vs ${row.opponent} · ${row.score.toFixed(2)} pts${row.opponentRank ? ` · Opponent pregame rank #${row.opponentRank}` : ''}`);
        const description = winner
            ? `**🏅 Coach of the Week: ${winner.coachName}**\n**${winner.team}** defeated ${winner.opponent} **${winner.pointsFor}–${winner.pointsAgainst}** in Week ${award.week}.\nAward score: **${winner.score.toFixed(2)}**\n\n**Top eligible performances**\n${candidateLines.join('\n') || 'No other eligible performances.'}`
            : `No eligible coached win or tie is recorded for Week ${award.week}.\n\nA coach must be registered and assigned to a team that played a finalized game. Losses are not eligible for the award.`;
        const embed = new EmbedBuilder().setColor(0x0F766E)
            .setTitle(`🏅 ${dynasty.name} · Season ${award.season} Week ${award.week} Coach of the Week`)
            .setDescription(description.slice(0, 4000))
            .addFields({ name: 'Scoring Criteria', value: award.scoring, inline: false })
            .setFooter({ text: 'Calculated from finalized current-season results and recorded coach/team assignments · Read-only award' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_coach-of-week:${dynasty.id}`).setLabel('Refresh Award').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_storylines:${dynasty.id}`).setLabel('Season Storylines').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-recap:${dynasty.id}`).setLabel('Weekly Recap').setEmoji('🗞️').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'storylines') {
        const story = buildSeasonStorylines(dynasty, { season: dynasty.season });
        const streakLines = story.streaks.map(row => `• **${row.team}** — ${row.count}-game ${row.type === 'win' ? 'winning' : 'losing'} streak (through Week ${row.throughWeek})`);
        const climbLines = story.rankClimbs.map(row => `• **${row.team}** climbed ${row.places} places (#${row.fromRank} → #${row.toRank}) by Week ${row.throughWeek}`);
        const performanceLines = story.bestPerformances.slice(0, 5).map(row => `• Week ${row.week}: **${row.homeTeam} ${row.homeScore} – ${row.awayScore} ${row.awayTeam}**${row.winner === 'Tie' ? ' · Tie' : ` · ${row.winner} won`} · ${row.margin}-point margin`);
        const embed = new EmbedBuilder().setColor(0x7C3AED)
            .setTitle(`📚 ${dynasty.name} · Season ${story.season} Storylines`)
            .setDescription([`**Season snapshot**
${story.gamesPlayed} finalized game(s) across ${story.weeksPlayed.length} week(s).`,
                `**Current Streaks**
${streakLines.join('\n') || 'No 2+ game winning or losing streaks yet.'}`,
                `**Biggest Ranking Climbs**
${climbLines.join('\n') || 'No 2-place-or-greater climbs between available weekly snapshots yet.'}`,
                `**Season-Best Game Margins**
${performanceLines.join('\n') || 'No finalized games recorded yet.'}`].join('\n\n').slice(0, 4000))
            .setFooter({ text: 'Calculated from finalized current-season results · Ranking movement compares cumulative weekly snapshots' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_storylines:${dynasty.id}`).setLabel('Refresh Storylines').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_weekly-recap:${dynasty.id}`).setLabel('Weekly Recap').setEmoji('🗞️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_power-rankings:${dynasty.id}`).setLabel('Power Rankings').setEmoji('📈').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'upsets') {
        const rows = buildUpsetTracker(dynasty, { season: dynasty.season, limit: 15 });
        const lines = rows.map((row, index) => `**${index + 1}.** ⚡ **${row.winner}** (#${row.winnerRank}) upset **${row.loser}** (#${row.loserRank}) · ${row.score} · Week ${row.week} · ${row.rankGap}-place gap${row.rankingSource === 'reconstructed-earlier-weeks' ? ' · reconstructed' : ''}`);
        const embed = new EmbedBuilder().setColor(0xB45309)
            .setTitle(`⚡ ${dynasty.name} · Season ${dynasty.season} Upset Tracker`)
            .setDescription(lines.join('\n').slice(0, 4000) || 'No ranked upsets are recorded for this season yet. Upsets are identified when a team ranked lower before the game defeats a higher-ranked opponent.')
            .setFooter({ text: 'Ranks use earlier-week finalized results; newly recorded games save a pregame ranking snapshot' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_upsets:${dynasty.id}`).setLabel('Refresh Upsets').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_power-rankings:${dynasty.id}`).setLabel('Power Rankings').setEmoji('📈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_schedule:${dynasty.id}`).setLabel('Schedule & Results').setEmoji('📅').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'power-rankings') {
        const rows = calculatePowerRankings(dynasty);
        const lines = rows.slice(0, 25).map((row, index) => {
            const record = `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`;
            const differential = row.pointDifferential > 0 ? `+${row.pointDifferential}` : String(row.pointDifferential);
            return `**${index + 1}.** ${getTeamEmoji(dynasty, row.team)} **${row.team}** — ${record} · ${row.powerScore.toFixed(2)} pts · PD ${differential} · Form ${row.recentForm}`;
        });
        const embed = new EmbedBuilder().setColor(0x2563EB)
            .setTitle(`📈 ${dynasty.name} · Season ${dynasty.season} Power Rankings`)
            .setDescription(lines.join('\n') || 'No teams are registered yet. Register or select teams to begin power rankings.')
            .setFooter({ text: 'Calculated from finalized current-season games · Separate from manually published league rankings' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_standings:${dynasty.id}`).setLabel('Standings').setEmoji('📊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_schedule:${dynasty.id}`).setLabel('Schedule & Results').setEmoji('📅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_power-rankings:${dynasty.id}`).setLabel('Refresh Rankings').setEmoji('🔄').setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'rivalry-week') {
        const week = buildRivalryWeek(dynasty, dynasty.season);
        const lines = week.upcoming.slice(0, 15).map((game, index) => {
            const record = `${game.teamAWins}-${game.teamBWins}${game.ties ? `-${game.ties}` : ''}`;
            const streak = game.streak.count ? ` · ${game.streak.count} straight ${game.streak.side === 'A' ? game.teamA : game.teamB} win(s)` : '';
            const latest = game.latest ? `
Last meeting: S${game.latest.season ?? '—'} W${game.latest.week ?? '—'} · ${game.latest.winner} (${game.latest.scoreA}–${game.latest.scoreB})` : '';
            const recent = game.recentResults.map(result => `S${result.season ?? '—'} W${result.week ?? '—'} ${result.scoreA}–${result.scoreB}`).join(' · ');
            return `**${index + 1}. 🔥 ${game.homeTeam} vs ${game.awayTeam}** — Week ${game.week ?? 'TBD'}
Series: ${game.teamA} leads ${record} across ${game.priorGames} finalized game(s)${streak}${latest}${recent ? `
Recent meetings: ${recent}` : ''}`;
        });
        const embed = new EmbedBuilder().setColor(0xB45309)
            .setTitle(`🔥 ${dynasty.name} · Rivalry Week · Season ${week.season ?? '—'}`)
            .setDescription(lines.join('\n\n').slice(0, 3800) || 'No upcoming scheduled games match a rivalry with recorded head-to-head history for this season. As official rivalry results are recorded, future matchups will appear here.')
            .addFields({ name: 'Coverage', value: `${week.trackedRivalries} tracked rivalry series · ${week.upcoming.length} upcoming matchup(s)` })
            .setFooter({ text: 'Upcoming matchups use scheduled games; series records and recent results use finalized scores only.' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_rivalries:${dynasty.id}`).setLabel('Rivalry Tracker').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_schedule:${dynasty.id}`).setLabel('Schedule & Results').setEmoji('📅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_rivalry-week:${dynasty.id}`).setLabel('Refresh Rivalry Week').setEmoji('🔄').setStyle(ButtonStyle.Primary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'rivalries') {
        const rivalries = buildRivalryTracker(dynasty);
        const lines = rivalries.slice(0, 20).map((row, index) => {
            const streak = row.streak.count ? ` · Streak: ${row.streak.count} straight ${row.streak.side === 'A' ? row.teamA : row.teamB} win(s)` : '';
            const latest = row.latest ? ` · Latest: S${row.latest.season ?? '—'} W${row.latest.week ?? '—'} ${row.latest.scoreA}–${row.latest.scoreB}` : '';
            const recent = row.recentResults.map(result => `S${result.season ?? '—'} W${result.week ?? '—'} ${result.scoreA}–${result.scoreB}`).join(', ');
            return `**${index + 1}. ${row.teamA} vs ${row.teamB}** — ${row.teamA} leads ${row.teamAWins}-${row.teamBWins}${row.ties ? `-${row.ties}` : ''}
${row.games} finalized game(s) · ${row.seasons.length} season(s)${streak}${latest}${recent ? `\nRecent: ${recent}` : ''}`;
        });
        const coachRivalries = buildCoachRivalries(dynasty);
        const coachLines = coachRivalries.slice(0, 5).map(row => {
            const streak = row.streak.count ? ` · ${row.streak.count} straight ${row.streak.coachId === row.coachA ? row.coachAName : row.coachBName} win(s)` : '';
            return `• **${row.coachAName} vs ${row.coachBName}** — ${row.coachAWins}-${row.coachBWins}${row.ties ? `-${row.ties}` : ''} across ${row.games} game(s)${streak}`;
        });
        const rivalryDescription = lines.join('\n\n') || 'No finalized head-to-head results are recorded yet. Rivalries appear automatically when official game scores are recorded.';
        const embed = new EmbedBuilder().setColor(0xB45309)
            .setTitle(`🔥 ${dynasty.name} · Rivalry Tracker`)
            .setDescription(rivalryDescription.slice(0, 3000))
            .addFields({ name: 'Coach Head-to-Head', value: coachLines.join('\n').slice(0, 1000) || 'Coach matchups appear when both coaches have unambiguous recorded assignments for finalized games.' })
            .setFooter({ text: 'Program records use finalized results · Coach records require unambiguous recorded tenures or current-season assignments' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_standings:${dynasty.id}`).setLabel('Standings').setEmoji('📊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_schedule:${dynasty.id}`).setLabel('Schedule & Results').setEmoji('📅').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_rivalries:${dynasty.id}`).setLabel('Refresh Rivalries').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_rivalry-week:${dynasty.id}`).setLabel('Rivalry Week').setEmoji('🔥').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'signing-day') {
        const recap = buildSigningDayRecap(dynasty, dynasty.season);
        const teamLines = recap.teams.slice(0, 12).map((row, index) => {
            const names = row.prospects.slice(0, 3).map(p => `${p.stars ? `${'⭐'.repeat(p.stars)} ` : ''}**${p.name}** (${p.position})`).join(' · ');
            const positions = Object.entries(row.positionCounts || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([position, count]) => `${position} ${count}`).join(' · ');
            const spotlight = row.topProspect ? `\n🌟 **Top recorded recruit:** ${row.topProspect.name} (${row.topProspect.position}, ${row.topProspect.stars}★)` : '';
            return `**${index + 1}. ${row.team}** — ${row.count} signed · ${row.starPoints} star points${row.averageStars !== null ? ` · ${row.averageStars.toFixed(2)} avg` : ''}${names ? `\n${names}` : ''}${spotlight}${positions ? `\nPositions: ${positions}` : ''}`;
        });
        const historyLines = recap.seasonTotals.slice(0, 8).map(row => `• **Season ${row.season}** — ${row.signed} signed recruit(s) across ${row.teams} team(s)`);
        const starDistribution = recap.teams.reduce((counts, row) => {
            for (const [stars, count] of Object.entries(row.starDistribution || {})) counts[stars] = (counts[stars] || 0) + count;
            return counts;
        }, {});
        const starSummary = Object.keys(starDistribution).sort((a, b) => Number(b) - Number(a)).map(stars => `${'⭐'.repeat(Number(stars))} ${starDistribution[stars]}`).join(' · ');
        const topClass = recap.teams[0];
        const embed = new EmbedBuilder().setColor(0x166534)
            .setTitle(`✍️ ${dynasty.name} · Signing Day Ceremony`)
            .setDescription(`**Season ${dynasty.season}: ${recap.signedCount} signed recruit(s)**\n${topClass ? `**Highest recorded class score:** ${topClass.team} · ${topClass.starPoints} star points\n` : ''}${starSummary ? `**Star distribution:** ${starSummary}\n` : ''}\n${teamLines.join('\n\n') || 'No prospects are marked Signed for this season yet. Staff can record signings with `/league recruit-prospect`.'}`.slice(0, 3800))
            .addFields({ name: 'Season-by-season recap', value: historyLines.join('\n').slice(0, 1000) || 'No historical signings recorded.' })
            .setFooter({ text: 'Ceremony highlights are derived from recorded Signed prospects · Star distribution excludes invalid ratings' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting:${dynasty.id}`).setLabel('Class Rankings').setEmoji('⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-compare:${dynasty.id}`).setLabel('Class Comparison').setEmoji('⚖️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-history:${dynasty.id}`).setLabel('Activity History').setEmoji('🕒').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_signing-day:${dynasty.id}`).setLabel('Refresh Signing Day').setEmoji('🔄').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'recruiting') {
        const rankings = calculateRecruitingRankings(dynasty, dynasty.season);
        const lines = rankings.slice(0, 20).map((row, index) => {
            const prospects = row.prospects.slice().sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
            const topNames = prospects.slice(0, 3).map(p => `${'⭐'.repeat(p.stars)} ${p.name} (${p.position})`).join(' · ');
            return `**${index + 1}. ${row.team}** — ${row.starPoints} star points · ${row.signed} signed
${topNames}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`⭐ ${dynasty.name} · Season ${dynasty.season} Recruiting Class Rankings`)
            .setDescription(lines.join('\n\n').slice(0, 4000) || 'No signed prospects are recorded for this season yet. Staff can update prospect status with `/league recruit-prospect`.')
            .setFooter({ text: 'Rankings use recorded Signed prospects only · Score = sum of star ratings' });
        const needsButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-needs:${dynasty.id}`).setLabel('Position Needs').setEmoji('🧭').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-compare:${dynasty.id}`).setLabel('Class Comparison').setEmoji('⚖️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-pipeline:${dynasty.id}`).setLabel('Pipeline Tracker').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-history:${dynasty.id}`).setLabel('Activity History').setEmoji('🕒').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_signing-day:${dynasty.id}`).setLabel('Signing Day').setEmoji('✍️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-archive:${dynasty.id}`).setLabel('Class Archive').setEmoji('🗂️').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [needsButton], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'recruiting-archive') {
        const archive = buildRecruitingClassArchive(dynasty, { limit: 12 });
        const sections = archive.seasons.map(seasonRow => {
            const leaders = seasonRow.teams.slice(0, 8).map((row, index) =>
                `**${index + 1}. ${row.team}** — ${row.signed} signed · ${row.starPoints} star points${row.averageStars !== null ? ` · ${row.averageStars.toFixed(2)} avg stars` : ''}`
            );
            const more = seasonRow.teams.length > 8 ? `\n…and ${seasonRow.teams.length - 8} more team(s)` : '';
            return `**Season ${seasonRow.season}** — ${seasonRow.signed} signed across ${seasonRow.teams.length} team(s)\n${leaders.join('\n') || 'No class records.'}${more}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`🗂️ ${dynasty.name} · Historical Recruiting Class Archive`)
            .setDescription((sections.join('\n\n') || 'No historical recruiting prospect records are available yet. Classes will appear as recruiting records are saved.').slice(0, 3900))
            .setFooter({ text: `Showing ${archive.seasons.length} of ${archive.totalSeasons} recorded season(s) · Signed counts use explicit status · Star points include valid recorded 1–5 star ratings only` });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting:${dynasty.id}`).setLabel('Current Class Rankings').setEmoji('⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-compare:${dynasty.id}`).setLabel('Class Comparison').setEmoji('⚖️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_signing-day:${dynasty.id}`).setLabel('Signing Day').setEmoji('✍️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-archive:${dynasty.id}`).setLabel('Refresh Archive').setEmoji('🔄').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'recruiting-pipeline') {
        const pipeline = calculateRecruitingPipeline(dynasty, dynasty.season);
        const totals = Object.fromEntries(RECRUITING_STATUSES.map(status => [status, pipeline.reduce((sum, row) => sum + row.statuses[status], 0)]));
        const summary = RECRUITING_STATUSES.map(status => `${status}: **${totals[status]}**`).join(' · ');
        const lines = pipeline.slice(0, 20).map(row => {
            const counts = RECRUITING_STATUSES.map(status => `${status} ${row.statuses[status]}`).join(' · ');
            const top = row.prospects.slice(0, 3).map(prospect => `${prospect.stars ? '⭐'.repeat(Math.max(1, Math.min(5, prospect.stars))) + ' ' : ''}${prospect.name} (${prospect.position}) — ${prospect.status}`).join('\n');
            return `**${row.team}** — ${row.total} prospects\n${counts}${top ? `\n${top}` : ''}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`🧾 ${dynasty.name} · Season ${dynasty.season} Recruiting Pipeline`)
            .setDescription(`${summary}\n\n${lines.join('\n\n')}`.slice(0, 4000) || 'No recruiting prospects are recorded for this season.')
            .setFooter({ text: 'Counts use saved prospect statuses for the selected season · Unknown statuses are grouped as Other' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting:${dynasty.id}`).setLabel('Class Rankings').setEmoji('⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-compare:${dynasty.id}`).setLabel('Class Comparison').setEmoji('⚖️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-needs:${dynasty.id}`).setLabel('Position Needs').setEmoji('🧭').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-archive:${dynasty.id}`).setLabel('Class Archive').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-pipeline:${dynasty.id}`).setLabel('Pipeline Tracker').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-history:${dynasty.id}`).setLabel('Activity History').setEmoji('🕒').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'recruiting-history') {
        const history = buildRecruitingHistory(dynasty, { season: dynasty.season, limit: 18 });
        const lines = history.items.map(event => {
            const transition = event.initial ? `entered pipeline as **${event.toStatus}**` : `moved from **${event.fromStatus}** to **${event.toStatus}**`;
            const timestamp = event.at ? `<t:${Math.floor(new Date(event.at).getTime() / 1000)}:R>` : 'time not recorded';
            const stars = event.stars ? `${'⭐'.repeat(Math.max(1, Math.min(5, event.stars)))} ` : '';
            const actor = event.actorId ? ` · by <@${event.actorId}>` : '';
            return `• ${timestamp} — **${event.team}**: ${stars}**${event.prospect}** (${event.position}) ${transition}${actor}`;
        });
        const notes = history.total === 0
            ? 'No recorded recruiting status history exists for this season yet. New prospect records and future status changes will appear here; older records are not reconstructed retroactively.'
            : `${lines.join('\n').slice(0, 3600)}${history.total > history.items.length ? `\n\nShowing ${history.items.length} of ${history.total} events.` : ''}${history.hasOlderUntrackedRecords ? '\n\nSome older prospect records have no tracked status history because they predate this feature.' : ''}`;
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`🕒 ${dynasty.name} · Season ${dynasty.season} Recruiting Activity`)
            .setDescription(notes)
            .setFooter({ text: 'New status changes are timestamped and attributed when the existing staff recruiting workflow records them.' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-pipeline:${dynasty.id}`).setLabel('Pipeline Tracker').setEmoji('🧾').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting:${dynasty.id}`).setLabel('Class Rankings').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-compare:${dynasty.id}`).setLabel('Class Comparison').setEmoji('⚖️').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'recruiting-compare') {
        const rankings = calculateRecruitingRankings(dynasty, dynasty.season);
        const needs = calculatePositionNeeds(dynasty, dynasty.season);
        const rankingsByTeam = new Map(rankings.map(row => [normalizeTeam(row.team), row]));
        const needsByTeam = new Map(needs.map(row => [normalizeTeam(row.team), row]));
        const allTeams = [...new Set([...needs.map(row => row.team), ...rankings.map(row => row.team)])]
            .sort((a, b) => {
                const left = rankingsByTeam.get(normalizeTeam(a)) || { starPoints: 0, signed: 0, averageStars: 0 };
                const right = rankingsByTeam.get(normalizeTeam(b)) || { starPoints: 0, signed: 0, averageStars: 0 };
                return right.starPoints - left.starPoints || right.signed - left.signed || a.localeCompare(b);
            });
        const lines = allTeams.slice(0, 20).map((team, index) => {
            const row = rankingsByTeam.get(normalizeTeam(team)) || { signed: 0, starPoints: 0, averageStars: 0, prospects: [] };
            const teamNeeds = needsByTeam.get(normalizeTeam(team));
            const topSignees = row.prospects.slice().sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name)).slice(0, 2)
                .map(p => `${'⭐'.repeat(p.stars)} ${p.name} (${p.position})`).join(' · ') || 'No signed prospects';
            const coverage = teamNeeds ? Object.values(teamNeeds.positions).filter(pos => pos.signedCount > 0).map(pos => `${pos.position} ${pos.signedCount}`).join(', ') : '';
            return `**${index + 1}. ${team}** — ${row.signed} signed · ${row.starPoints} points · ${row.signed ? row.averageStars.toFixed(2) : '—'} avg stars
${topSignees}${coverage ? `
**Position coverage:** ${coverage}` : ''}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`⚖️ ${dynasty.name} · Season ${dynasty.season} Recruiting Class Comparison`)
            .setDescription(lines.join('\n\n').slice(0, 4000) || 'No teams or recruiting records are available yet.')
            .setFooter({ text: 'Signed prospects only · Points = sum of recorded star ratings · Position coverage shown as signed count' });
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting:${dynasty.id}`).setLabel('Class Rankings').setEmoji('⭐').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_competition_recruiting-needs:${dynasty.id}`).setLabel('Position Needs').setEmoji('🧭').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'recruiting-needs') {
        const teams = calculatePositionNeeds(dynasty, dynasty.season);
        const lines = teams.slice(0, 20).map(entry => {
            const needs = entry.highNeeds.map(item => `${item.position} (${item.rosterCount} rostered)`).join(', ') || 'No high-priority thin positions';
            const coverage = Object.values(entry.positions).filter(item => item.signedCount > 0).map(item => `${item.position}: ${item.signedCount} signed`).join(' · ') || 'No signed positional coverage';
            return `**${entry.team}** — ${needs}
${coverage}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`🧭 ${dynasty.name} · Season ${dynasty.season} Position Needs`)
            .setDescription(lines.join('\n\n').slice(0, 4000) || 'No teams or roster records are available yet.')
            .setFooter({ text: 'Roster depth: Thin 0–2 · Moderate 3–5 · Deep 6+ | Signed prospects shown separately; heuristic snapshot, not a roster rating' });
        return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'activity') {
        const feed = buildActivityFeed(dynasty, { limit: 10 });
        const lines = feed.map((item, index) => {
            const date = item.at ? ` · <t:${Math.floor(new Date(item.at).getTime() / 1000)}:R>` : ` · Season ${item.season ?? dynasty.season}`;
            return `**${index + 1}.** ${item.title}${date}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447)
            .setTitle(`📰 ${dynasty.name} · League Activity`)
            .setDescription(lines.join('\n').slice(0, 4000) || 'No recorded league activity yet. Final scores, championships, honors, and selected operations will appear here as they are recorded.')
            .setFooter({ text: 'Read-only activity feed · Uses existing league records and event logs' })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (!isHistoryButton && action === 'roster') {
        const teams = [...new Set([...(dynasty.teamSelections || []).map(s => s.team), ...(dynasty.teams || [])].filter(Boolean))].slice(0, 25);
        const rows = teams.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`blackline_competition_roster-team:${dynasty.id}`).setPlaceholder('Choose a team roster').addOptions(teams.map(team => ({ label: String(team).slice(0, 100), value: String(team).slice(0, 100) }))))] : [];
        const summary = teams.map(team => `**${team}** — ${teamRoster(dynasty, team).length} rostered players · ${teamProspects(dynasty, team).length} prospects for Season ${dynasty.season}`).slice(0, 20).join('\n');
        const embed = new EmbedBuilder().setColor(0x243447).setTitle(`👥 ${dynasty.name} · Team Rosters`).setDescription(summary || 'No teams or roster records are available yet.').setFooter({ text: 'Public read-only view · Team roster records are managed by league staff' });
        return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    if (!isHistoryButton && action === 'roster-team' && interaction.isStringSelectMenu()) {
        const team = interaction.values[0];
        const teams = [...(dynasty.teamSelections || []).map(s => s.team), ...(dynasty.teams || [])];
        if (!teams.some(name => normalizeTeam(name) === normalizeTeam(team))) return interaction.reply({ content: 'That team is not registered in this dynasty.', ephemeral: true });
        const players = teamRoster(dynasty, team); const prospects = teamProspects(dynasty, team);
        const playerLines = players.map(p => `**${p.position}** · ${p.number == null ? '—' : `#${p.number}`} ${p.name} — ${p.classYear}${p.development ? ` · ${p.development.overall} OVR` : ''}${p.hometown ? ` · ${p.hometown}` : ''}`);
        const prospectLines = prospects.map(p => `${'⭐'.repeat(p.stars)} **${p.name}** · ${p.position} · ${p.status}`);
        const embed = new EmbedBuilder().setColor(0x243447).setTitle(`👥 ${team} · Roster & Recruiting`).addFields(
            { name: `Roster (${players.length})`, value: playerLines.slice(0, 15).join('\n').slice(0, 1024) || 'No roster players recorded.', inline: false },
            { name: `Season ${dynasty.season} Prospects (${prospects.length})`, value: prospectLines.slice(0, 10).join('\n').slice(0, 1024) || 'No prospects recorded for this season.', inline: false }
        ).setFooter({ text: 'Public read-only view · Contact league staff to correct records' });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (isHistoryButton && action === 'refresh') {
        await refreshHistoryPanel(interaction.client, dynasty);
        return interaction.reply({ content: 'League history refreshed.', ephemeral: true });
    }
    if (isHistoryButton && action === 'stats') {
        return interaction.reply({ embeds: [buildAllTimeStatsEmbed(dynasty)], components: buildProgramStatsComponents(dynasty), ephemeral: true });
    }
    if (isHistoryButton && action === 'program' && interaction.isStringSelectMenu()) {
        const selected = interaction.values?.[0];
        if (!selected || !programNamesFor(dynasty).some(name => normalizeTeam(name) === normalizeTeam(selected))) {
            return interaction.reply({ content: 'That program is not available in the current league history.', ephemeral: true });
        }
        return interaction.reply({ embeds: [buildProgramProfileEmbed(dynasty, selected)], components: buildProgramStatsComponents(dynasty), ephemeral: true });
    }
    if (isHistoryButton && action === 'overview') {
        return interaction.reply({ embeds: [buildHistoryPanelEmbed(dynasty)], ephemeral: true });
    }
    if (isHistoryButton && action === 'player-careers') {
        const careerData = buildPlayerCareerRecords(dynasty);
        const lines = careerData.players.slice(0, 12).map((p, i) => {
            const seasons = p.seasons.length ? `${p.seasons[0]}${p.seasons.length > 1 ? `–${p.seasons[p.seasons.length - 1]}` : ''}` : '—';
            const teams = p.teams.slice(0, 3).join(', ');
            return `**${i + 1}. ${p.name}** — ${p.heismanCount} Heisman · ${p.awardCount} other/total award record(s) · ${p.draftCount} draft record(s)
Seasons: ${seasons}${teams ? ` · Team(s): ${teams}` : ''}`;
        });
        const embed = new EmbedBuilder().setColor(0x243447).setTitle(`📊 ${dynasty.name} · Player Career Records`)
            .setDescription([lines.join('\n\n') || 'No player career history is recorded yet.', `**Coverage**\n${careerData.note}`].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${careerData.players.length} player career(s) · ${careerData.validRecords} source record(s) · Read-only` }).setTimestamp(new Date());
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_history_player-careers:${dynasty.id}`).setLabel('Refresh Careers').setEmoji('🔄').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`blackline_history_award-leaders:${dynasty.id}`).setLabel('Award Leaders').setEmoji('🏆').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_history_draft:${dynasty.id}`).setLabel('Draft History').setEmoji('🏈').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_overview:${dynasty.id}`).setLabel('History Overview').setEmoji('📚').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (isHistoryButton && action === 'award-leaders') {
        const leaders = buildAwardLeaders(dynasty);
        const people = leaders.recipientLeaders.slice(0, 10).map((row, index) => `**${index + 1}. ${row.name}** — ${row.count} recorded honor(s) · ${row.awards.length} award type(s) · Seasons ${row.seasons.join(', ')}`).join('\n');
        const categories = leaders.awardLeaders.slice(0, 8).map((row, index) => `**${index + 1}. ${row.name}** — ${row.count} recipient record(s) · ${row.winners.length} distinct winner(s)`).join('\n');
        const embed = new EmbedBuilder().setColor(0x243447).setTitle(`🏆 ${dynasty.name} · All-Time Award Leaders`)
            .setDescription([`**Most decorated recipients**\n${people || 'No valid award history has been recorded yet.'}`, `**Most frequently recorded awards**\n${categories || 'No award categories are recorded yet.'}`, `**Data coverage**\n${leaders.note}`].join('\n\n').slice(0, 4000))
            .setFooter({ text: `${leaders.validRecords} verified-format award record(s) · Historical read-only view` }).setTimestamp(new Date());
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blackline_history_award-leaders:${dynasty.id}`).setLabel('Refresh Leaders').setEmoji('🔄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`blackline_history_awards:${dynasty.id}`).setLabel('Award History').setEmoji('📚').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`blackline_history_overview:${dynasty.id}`).setLabel('History Overview').setEmoji('📖').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (isHistoryButton && ['champions', 'conferences', 'heisman', 'awards', 'records', 'draft', 'archives'].includes(action)) {
        return interaction.reply({ embeds: [buildHistoryCategoryEmbed(dynasty, action)], ephemeral: true });
    }
    if (action === 'report-score') {
        const coach = (dynasty.coaches || []).find(c => c.userId === interaction.user.id);
        const selections = (dynasty.teamSelections || []).filter(s => s.userId === interaction.user.id);
        if (!coach || selections.length === 0) {
            return interaction.reply({ content: 'You must be a registered coach with a selected team to report a score. Use the team-selection panel first or contact a league manager.', ephemeral: true });
        }
        const modal = new ModalBuilder()
            .setCustomId(`blackline_score_report_modal:${dynasty.id}`)
            .setTitle('Submit Final Score');
        const week = new TextInputBuilder().setCustomId('week').setLabel('Week number (0–15)').setStyle(TextInputStyle.Short).setPlaceholder('e.g. 4').setRequired(true).setMinLength(1).setMaxLength(2);
        const home = new TextInputBuilder().setCustomId('home').setLabel('Home team name').setStyle(TextInputStyle.Short).setPlaceholder('Enter the exact team name').setRequired(true).setMaxLength(80);
        const away = new TextInputBuilder().setCustomId('away').setLabel('Away team name').setStyle(TextInputStyle.Short).setPlaceholder('Enter the exact team name').setRequired(true).setMaxLength(80);
        const homeScore = new TextInputBuilder().setCustomId('home_score').setLabel('Home team final score').setStyle(TextInputStyle.Short).setPlaceholder('e.g. 28').setRequired(true).setMinLength(1).setMaxLength(3);
        const awayScore = new TextInputBuilder().setCustomId('away_score').setLabel('Away team final score').setStyle(TextInputStyle.Short).setPlaceholder('e.g. 21').setRequired(true).setMinLength(1).setMaxLength(3);
        modal.addComponents(
            new ActionRowBuilder().addComponents(week),
            new ActionRowBuilder().addComponents(home),
            new ActionRowBuilder().addComponents(away),
            new ActionRowBuilder().addComponents(homeScore),
            new ActionRowBuilder().addComponents(awayScore)
        );
        return interaction.showModal(modal);
    }
    if (action === 'refresh') {
        const embed = buildCompetitionPanelEmbed(dynasty);
        await interaction.message.edit({ embeds: [embed], components: buildCompetitionPanelButtons(dynasty.id) });
        return interaction.reply({ content: 'Competition panel refreshed.', ephemeral: true });
    }
    let embed;
    if (action === 'standings') {
        const rows = standingsFor(dynasty);
        const lines = rows.map((r,i) => `**${i+1}.** ${getTeamEmoji(dynasty,r.team)} **${r.team}** — ${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''} · PF ${r.pointsFor} · PA ${r.pointsAgainst} · ${r.games} GP`);
        embed = new EmbedBuilder().setColor(0x243447).setTitle(`📊 ${dynasty.name} · Season ${dynasty.season} Standings`)
            .setDescription(lines.length ? lines.slice(0,25).join('\n') : 'No standings yet. Teams appear after selection or recorded game results.')
            .setFooter({ text: 'Verified scores · Tiebreakers: win percentage, head-to-head, point differential, points scored' });
    } else if (action === 'schedule') {
        const games = currentSeasonGames(dynasty).sort((a,b) => a.week-b.week || (a.kickoff||'').localeCompare(b.kickoff||''));
        embed = new EmbedBuilder().setColor(0x243447).setTitle(`📅 ${dynasty.name} · Season ${dynasty.season} Schedule & Results`)
            .setDescription(games.length ? games.slice(0,25).map(g => formatGame(dynasty,g)).join('\n') : 'No games are scheduled or recorded for this season.')
            .setFooter({ text: games.length > 25 ? `Showing 25 of ${games.length} games` : `${games.length} game(s)` });
    } else if (action === 'rankings') {
        const teams = (dynasty.rankings || []).filter(t => t && t !== 'N/A');
        embed = new EmbedBuilder().setColor(0x243447).setTitle(`🏈 ${dynasty.name} · Season ${dynasty.season} Rankings`)
            .setDescription(teams.length ? teams.map((t,i) => `**${i+1}.** ${getTeamEmoji(dynasty,t)} ${t}`).join('\n') : 'Rankings have not been published yet.')
            .setFooter({ text: 'Rankings are maintained by league management' });
    } else if (action === 'champions') {
        const history = [...(dynasty.championshipHistory || [])].sort((a,b) => Number(b.season)-Number(a.season));
        embed = new EmbedBuilder().setColor(0x243447).setTitle(`🏆 ${dynasty.name} · Championship History`)
            .setDescription(history.length ? history.slice(0,20).map(h => `**Season ${h.season} (${h.year || '—'})** — 🏆 **${h.champion}**${h.runnerUp ? ` over ${h.runnerUp}` : ''}${h.championScore !== null && h.championScore !== undefined ? ` · ${h.championScore}–${h.runnerUpScore}` : ''}`).join('\n') : (dynasty.defendingChampion && dynasty.defendingChampion !== 'N/A' ? `Current champion: **${dynasty.defendingChampion}**\nNo detailed championship history has been recorded yet.` : 'No champion has been recorded yet.'))
            .setFooter({ text: 'Championship history is recorded by league management' });
    } else if (action === 'playoffs') {
        embed = playoffBracketEmbed(dynasty);
    } else {
        return interaction.reply({ content: 'Unknown competition panel action.', ephemeral: true });
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
}


async function handleScoreReviewButton(interaction) {
    const [action, dynastyId, reportId] = interaction.customId.replace('blackline_score_review:', '').split(':');
    const database = loadDatabase();
    const dynasty = database.dynasties.find(d => d.id === dynastyId && d.status === 'active');
    if (!dynasty) return interaction.reply({ content: 'This league is no longer active.', ephemeral: true });
    if (!isManager(interaction)) return interaction.reply({ content: 'Only league managers can approve or reject reported scores.', ephemeral: true });
    if (!Array.isArray(dynasty.pendingScoreReports)) dynasty.pendingScoreReports = [];
    const report = dynasty.pendingScoreReports.find(r => r.id === reportId);
    if (!report || report.status !== 'pending') return interaction.reply({ content: 'This score report has already been reviewed or is no longer available.', ephemeral: true });

    report.status = action === 'approve' ? 'approved' : 'rejected';
    report.reviewedBy = interaction.user.id;
    report.reviewedAt = new Date().toISOString();
    if (action === 'approve') {
        if (Number(report.season) !== Number(dynasty.season)) {
            report.status = 'stale-season';
            saveDatabase(database);
            return interaction.reply({ content: `This report belongs to Season ${report.season}, but the active season is ${dynasty.season}. It was not applied. Review the historical record manually if needed.`, ephemeral: true });
        }
        const resultError = validateLeagueResult({ week: report.week, homeTeam: report.homeTeam, awayTeam: report.awayTeam, homeScore: report.homeScore, awayScore: report.awayScore });
        if (resultError) {
            report.status = 'invalid';
            saveDatabase(database);
            return interaction.reply({ content: `This score report failed validation: ${resultError} No score was applied.`, ephemeral: true });
        }
        let game = findGame(dynasty, report.week, report.homeTeam, report.awayTeam);
        if (game && normalizeTeam(game.homeTeam) !== normalizeTeam(report.homeTeam)) {
            report.status = 'conflict';
            saveDatabase(database);
            return interaction.reply({ content: 'The scheduled home/away order conflicts with this report. No score was applied; a manager must correct the schedule and review again.', ephemeral: true });
        }
        if (!game) {
            game = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, season: report.season, week: report.week, homeTeam: report.homeTeam, awayTeam: report.awayTeam, kickoff: null, createdBy: report.reportedBy, createdAt: report.reportedAt };
            dynasty.scheduleGames.push(game);
        }
        const previousResult = getPreviousResult(game) || 'not-final';
        capturePreGameRanks(dynasty, game);
        game.homeScore = report.homeScore;
        game.awayScore = report.awayScore;
        game.status = 'final';
        game.recordedBy = interaction.user.id;
        game.recordedAt = new Date().toISOString();
        game.scoreReportId = report.id;
        appendAuditEntry(dynasty, { action: previousResult === 'not-final' ? 'score-report-approved' : 'score-report-corrected', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { reportId: report.id, season: report.season, week: report.week, home: report.homeTeam, away: report.awayTeam, previous: previousResult, correctedTo: `${report.homeScore}-${report.awayScore}` } });
    }
    saveDatabase(database);
    if (action === 'approve') {
        await interaction.message.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x238636).setFooter({ text: `Approved by ${interaction.user.tag}` })], components: [] }).catch(() => {});
        await updateAllDashboards(interaction.client);
        await refreshCompetitionPanel(interaction.client, dynasty);
        return interaction.reply({ content: `Approved. ${report.awayTeam} ${report.awayScore} at ${report.homeTeam} ${report.homeScore} is now an official result.`, ephemeral: true });
    }
    await interaction.message.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xB42318).setFooter({ text: `Rejected by ${interaction.user.tag}` })], components: [] }).catch(() => {});
    return interaction.reply({ content: 'Score report rejected. No standings were changed.', ephemeral: true });
}

async function reportScore(interaction, dynasty) {
    return submitScoreReport(interaction, dynasty, {
        week: interaction.options.getInteger('week'),
        homeTeam: interaction.options.getString('home').trim(),
        awayTeam: interaction.options.getString('away').trim(),
        homeScore: interaction.options.getInteger('home-score'),
        awayScore: interaction.options.getInteger('away-score')
    });
}

async function handleScoreReportModal(interaction) {
    const dynastyId = interaction.customId.split(':')[1];
    const database = loadDatabase();
    const dynasty = database.dynasties.find(d => d.id === dynastyId && d.status === 'active');
    if (!dynasty) return interaction.reply({ content: 'This league is no longer active. Please use the current competition panel.', ephemeral: true });
    const parseIntField = id => {
        const value = interaction.fields.getTextInputValue(id).trim();
        if (!/^\d+$/.test(value)) return null;
        const number = Number(value);
        return Number.isSafeInteger(number) ? number : null;
    };
    const week = parseIntField('week');
    const homeScore = parseIntField('home_score');
    const awayScore = parseIntField('away_score');
    if (week === null || week < 0 || week > 15 || homeScore === null || homeScore < 0 || homeScore > 300 || awayScore === null || awayScore < 0 || awayScore > 300) {
        return interaction.reply({ content: 'Invalid numbers. Week must be 0–15 and each score must be 0–300. Please submit again using the Report Score button.', ephemeral: true });
    }
    return submitScoreReport(interaction, dynasty, {
        week,
        homeTeam: interaction.fields.getTextInputValue('home').trim(),
        awayTeam: interaction.fields.getTextInputValue('away').trim(),
        homeScore,
        awayScore
    });
}

async function submitScoreReport(interaction, dynasty, { week, homeTeam, awayTeam, homeScore, awayScore }) {
    if (normalizeTeam(homeTeam) === normalizeTeam(awayTeam)) return interaction.reply({ content: 'Home and away teams must be different.', ephemeral: true });
    const coach = (dynasty.coaches || []).find(c => c.userId === interaction.user.id);
    const selections = (dynasty.teamSelections || []).filter(s => s.userId === interaction.user.id).map(s => normalizeTeam(s.team));
    if (!coach || (!selections.includes(normalizeTeam(homeTeam)) && !selections.includes(normalizeTeam(awayTeam)))) {
        return interaction.reply({ content: 'You must be a registered coach and report a game involving your selected team.', ephemeral: true });
    }
    if (!dynasty.competitionChannelId) return interaction.reply({ content: 'The competition panel must be set up first. Ask a league manager to run `/league panel` in 🏆・competition.', ephemeral: true });
    const channel = await interaction.client.channels.fetch(dynasty.competitionChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) return interaction.reply({ content: 'The competition channel is unavailable. Contact a league manager.', ephemeral: true });
    if (!Array.isArray(dynasty.pendingScoreReports)) dynasty.pendingScoreReports = [];
    const duplicate = dynasty.pendingScoreReports.find(r => r.status === 'pending' && Number(r.season) === Number(dynasty.season) && Number(r.week) === week && normalizeTeam(r.homeTeam) === normalizeTeam(homeTeam) && normalizeTeam(r.awayTeam) === normalizeTeam(awayTeam));
    if (duplicate) return interaction.reply({ content: 'A score report for this exact matchup is already awaiting review.', ephemeral: true });
    const report = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, season: dynasty.season, week, homeTeam, awayTeam, homeScore, awayScore, reportedBy: interaction.user.id, reportedAt: new Date().toISOString(), status: 'pending' };
    const embed = new EmbedBuilder().setColor(0xD97706).setTitle(`📝 Score Report · ${dynasty.name}`)
        .setDescription(`**Season ${report.season} · Week ${week}**\n${getTeamEmoji(dynasty, awayTeam)} **${awayTeam} ${awayScore}** at ${getTeamEmoji(dynasty, homeTeam)} **${homeTeam} ${homeScore}**\n\nReported by <@${interaction.user.id}>. This result will not affect standings until a league manager approves it.`)
        .setTimestamp(new Date());
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`blackline_score_review:approve:${dynasty.id}:${report.id}`).setLabel('Approve score').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`blackline_score_review:reject:${dynasty.id}:${report.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
    );
    // Store report before sending; if Discord send fails, roll it back to avoid an invisible pending report.
    dynasty.pendingScoreReports.push(report);
    const freshDb = loadDatabase();
    const freshDynasty = freshDb.dynasties.find(d => d.id === dynasty.id);
    if (freshDynasty) {
        if (!Array.isArray(freshDynasty.pendingScoreReports)) freshDynasty.pendingScoreReports = [];
        if (!freshDynasty.pendingScoreReports.some(r => r.id === report.id)) freshDynasty.pendingScoreReports.push(report);
        saveDatabase(freshDb);
    }
    try {
        const message = await channel.send({ embeds: [embed], components: [row] });
        report.reviewMessageId = message.id;
        const latest = loadDatabase();
        const target = latest.dynasties.find(d => d.id === dynasty.id);
        const stored = target?.pendingScoreReports?.find(r => r.id === report.id);
        if (stored) { stored.reviewMessageId = message.id; saveDatabase(latest); }
    } catch (error) {
        const latest = loadDatabase();
        const target = latest.dynasties.find(d => d.id === dynasty.id);
        if (target) { target.pendingScoreReports = (target.pendingScoreReports || []).filter(r => r.id !== report.id); saveDatabase(latest); }
        console.error('Could not post score report for review:', error);
        return interaction.reply({ content: 'Could not post the score report. Check the bot’s channel permissions and try again.', ephemeral: true });
    }
    return interaction.reply({ content: `Score report submitted for manager approval in <#${channel.id}>. Standings will not change until it is approved.`, ephemeral: true });
}

async function refreshCoachCenterPanel(client, dynasty) {
    try {
        const target = await recoverPanelTarget(client, dynasty, {
            channelKey: 'coachCenterChannelId', messageKey: 'coachCenterMessageId',
            channelNames: ['🏟️・coach-center'],
            matchesMessage: message => message.embeds?.some(embed => embed.title === `🏟️ ${dynasty.name} · Coach Center`)
        });
        if (!target.channel || !target.message) return false;
        await target.message.edit({ embeds: [coachPanelEmbed(dynasty, 0)], components: coachPanelComponents(dynasty, 0), allowedMentions: { parse: [] } });
        dynasty.coachCenterChannelId = target.channel.id;
        dynasty.coachCenterMessageId = target.message.id;
        if (target.recovered) persistPanelReferences(dynasty, ['coachCenterChannelId', 'coachCenterMessageId']);
        return true;
    } catch (error) {
        console.error(`Could not refresh Coach Center panel for ${dynasty.name}:`, error);
        return false;
    }
}

async function refreshCompetitionPanel(client, dynasty) {
    try {
        const target = await recoverPanelTarget(client, dynasty, {
            channelKey: 'competitionChannelId', messageKey: 'competitionMessageId',
            channelNamePattern: /competition/i,
            matchesMessage: message => message.embeds?.some(embed => embed.title === `🏆 BLACKLINE · ${dynasty.name} Competition Center`)
        });
        if (!target.channel || !target.message) return false; // Refresh only edits an existing panel; it never creates duplicates.
        await target.message.edit({ content: '', embeds: [buildCompetitionPanelEmbed(dynasty)], components: buildCompetitionPanelButtons(dynasty.id), allowedMentions: { parse: [] } });
        dynasty.competitionChannelId = target.channel.id;
        dynasty.competitionMessageId = target.message.id;
        if (target.recovered) persistPanelReferences(dynasty, ['competitionChannelId', 'competitionMessageId']);
        return true;
    } catch (error) {
        console.error(`Could not refresh competition panel for ${dynasty.name}:`, error);
        return false;
    }
}

function coachCenterChannel(guild, dynasty) {
    return guild.channels.cache.find(channel => channel.name === '🏟️・coach-center' && channel.type === ChannelType.GuildText && (!dynasty.categoryId || channel.parentId === dynasty.categoryId));
}
function coachProfileData(dynasty, userId) {
    if (!dynasty.coachProfiles || typeof dynasty.coachProfiles !== 'object') dynasty.coachProfiles = {};
    if (!dynasty.coachProfiles[userId]) dynasty.coachProfiles[userId] = {};
    return dynasty.coachProfiles[userId];
}
function coachPanelEmbed(dynasty, page = 0) {
    const coaches = [...(dynasty.coaches || [])].sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
    const pages = Math.max(1, Math.ceil(coaches.length / 25));
    const safePage = Math.max(0, Math.min(Number(page) || 0, pages - 1));
    const selected = coaches.slice(safePage * 25, safePage * 25 + 25);
    const lines = selected.map((coach, index) => {
        const team = (dynasty.teamSelections || []).find(selection => selection.userId === coach.userId);
        const profile = (dynasty.coachProfiles || {})[coach.userId] || {};
        return `${safePage * 25 + index + 1}. ${team ? `${getTeamEmoji(dynasty, team.team)} **${team.team}** · ` : '🏈 **Team not selected** · '}<@${coach.userId}>${profile.title ? ` — ${profile.title}` : ''}`;
    });
    return new EmbedBuilder().setColor(0x243447)
        .setTitle(`🏟️ ${dynasty.name} · Coach Center`)
        .setDescription('Explore the coaches behind each program. Select a coach to open their profile, or use **Edit My Profile** to add your coaching background and philosophy.\n\n' + (lines.length ? lines.join('\n') : '_No coaches have joined this dynasty yet._'))
        .addFields({ name: 'Coach Profiles', value: `${coaches.length} registered coach(es) · Page ${safePage + 1}/${pages}\nProfiles are player-editable; team and game records are generated from league data.`, inline: false })
        .setFooter({ text: 'BLACKLINE • Coach Center' });
}
function coachPanelComponents(dynasty, page = 0) {
    const coaches = [...(dynasty.coaches || [])].sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
    const pages = Math.max(1, Math.ceil(coaches.length / 25));
    const safePage = Math.max(0, Math.min(Number(page) || 0, pages - 1));
    const select = new StringSelectMenuBuilder().setCustomId(`blackline_coach_select:${dynasty.id}:${safePage}`).setPlaceholder('Select a coach profile...').setMinValues(1).setMaxValues(1);
    const selected = coaches.slice(safePage * 25, safePage * 25 + 25);
    if (selected.length) {
        for (const coach of selected) {
            const team = (dynasty.teamSelections || []).find(selection => selection.userId === coach.userId);
            select.addOptions({ label: String(coach.username || coach.userId).slice(0, 100), value: coach.userId, description: (team ? team.team : 'Team not selected').slice(0, 100) });
        }
    } else select.addOptions({ label: 'No coaches registered yet', value: '__none__' });
    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`blackline_coach_page:${dynasty.id}:prev:${safePage}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
        new ButtonBuilder().setCustomId(`blackline_coach_page:${dynasty.id}:next:${safePage}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pages - 1),
        new ButtonBuilder().setCustomId(`blackline_coach_edit:${dynasty.id}`).setLabel('Edit My Profile').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`blackline_coach_refresh:${dynasty.id}:${safePage}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`blackline_coach_legacy:${dynasty.id}`).setLabel('Legacy Rankings').setEmoji('🏛️').setStyle(ButtonStyle.Success)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`blackline_coach_hall-of-fame:${dynasty.id}`).setLabel('Coaching Hall of Fame').setEmoji('🏛️').setStyle(ButtonStyle.Success)
    );
    return [row1, row2, row3];
}
function normalizeCoachTeam(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function coachCareerEntries(dynasty, userId) {
    if (!dynasty.coachCareers || typeof dynasty.coachCareers !== 'object') dynasty.coachCareers = {};
    if (!Array.isArray(dynasty.coachCareers[userId])) dynasty.coachCareers[userId] = [];
    return dynasty.coachCareers[userId];
}
function coachCareerStats(dynasty, userId) {
    const selection = (dynasty.teamSelections || []).find(item => item.userId === userId);
    const entries = coachCareerEntries(dynasty, userId);
    const normalize = normalizeCoachTeam;
    // Count each explicitly recorded tenure once. Legacy/current-team game data is
    // used only when there is no career record for that team, preventing overlap.
    const careerTeams = new Set(entries.map(entry => normalize(entry.team)));
    let wins = 0, losses = 0, ties = 0;
    for (const entry of entries) {
        wins += Math.max(0, Number(entry.wins) || 0);
        losses += Math.max(0, Number(entry.losses) || 0);
        ties += Math.max(0, Number(entry.ties) || 0);
    }
    if (selection && !careerTeams.has(normalize(selection.team))) {
        const team = normalize(selection.team);
        const games = (dynasty.scheduleGames || []).filter(game => game.status === 'final' &&
            Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
            (normalize(game.homeTeam) === team || normalize(game.awayTeam) === team));
        for (const game of games) {
            const home = normalize(game.homeTeam) === team;
            const own = home ? game.homeScore : game.awayScore;
            const opponent = home ? game.awayScore : game.homeScore;
            if (own > opponent) wins++; else if (own < opponent) losses++; else ties++;
        }
    }
    const inCareer = (record) => {
        const team = normalize(record.team || record.champion || '');
        const season = Number(record.season);
        return entries.some(entry => normalize(entry.team) === team &&
            Number.isFinite(season) && season >= Number(entry.startSeason) &&
            season <= Number(entry.endSeason || entry.startSeason));
    };
    const unique = (items, keyFn) => [...new Map(items.filter(inCareer).map(item => [keyFn(item), item])).values()];
    const national = unique(dynasty.championshipHistory || [], i => `${i.season}|${normalize(i.champion)}`);
    const conference = unique(dynasty.conferenceChampionsHistory || [], i => `${i.season}|${normalize(i.champion || i.team)}|${normalize(i.detail || i.conference)}`);
    const heisman = unique(dynasty.heismanHistory || [], i => `${i.season}|${normalize(i.winner || i.player)}|${normalize(i.team)}`);
    const drafts = unique(dynasty.draftHistory || [], i => `${i.season}|${normalize(i.winner || i.player)}|${normalize(i.team)}|${normalize(i.detail)}`);
    const awards = unique(dynasty.awardHistory || [], i => `${i.season}|${normalize(i.winner || i.player)}|${normalize(i.team)}|${normalize(i.detail)}`);
    const games = wins + losses + ties;
    return {
        team: selection?.team || null, wins, losses, ties, games,
        winPct: games ? (wins + ties * 0.5) / games * 100 : 0,
        entries: [...entries].sort((a,b) => Number(a.startSeason) - Number(b.startSeason)),
        achievements: [
            ...national.map(i => `🏆 Season ${i.season}: National Champion — ${i.champion}`),
            ...conference.map(i => `🏅 Season ${i.season}: ${i.conference || i.detail || 'Conference'} Champion — ${i.champion || i.team}`),
            ...heisman.map(i => `⭐ Season ${i.season}: Heisman — ${i.winner || i.player}${i.team ? ` (${i.team})` : ''}`),
            ...drafts.map(i => `🎓 Season ${i.season}: Draft — ${i.player || i.winner}${i.detail ? ` · ${i.detail}` : ''}`),
            ...awards.map(i => `🏅 Season ${i.season}: ${i.award || i.detail || 'Award'} — ${i.winner || i.recipient}${i.team ? ` (${i.team})` : ''}`)
        ].slice(0, 15),
        titles: national.length, conferenceTitles: conference.length,
        draftedPlayers: drafts.length, heismanWinners: heisman.length, otherAwards: awards.length
    };
}
function coachLegacyLeaderboardEmbed(dynasty) {
    const coaches = (dynasty.coaches || []).map(coach => {
        const stats = coachCareerStats(dynasty, coach.userId);
        return { name: coach.username || `Coach ${String(coach.userId || '').slice(-4)}`, userId: coach.userId, stats };
    });
    const ranked = rankCoachLegacy(coaches);
    const lines = formatCoachLegacyLines(ranked, 15);
    return new EmbedBuilder().setColor(0x7C3AED)
        .setTitle(`🏛️ ${dynasty.name} · Coach Legacy Rankings`)
        .setDescription(lines.join('\n\n').slice(0, 4000) || 'No registered coaches are available yet.')
        .addFields({ name: 'How rankings work', value: 'Uses recorded coaching tenures, W–L–T records, national and conference titles, Heisman winners, draft picks, awards, and seasons coached. Missing history is not inferred.', inline: false })
        .setFooter({ text: 'Public Coach Center leaderboard · Refreshes from saved league records when opened' });
}

function coachProfileEmbed(dynasty, coach) {
    const profile = (dynasty.coachProfiles || {})[coach.userId] || {};
    const stats = coachCareerStats(dynasty, coach.userId);
    const seasonStats = buildCoachCareerBySeason(dynasty, coach.userId);
    const careerMilestones = buildCoachCareerMilestones(dynasty, coach.userId, seasonStats);
    const legacy = coachLegacy(stats);
    const record = stats.games ? `${stats.wins}-${stats.losses}${stats.ties ? `-${stats.ties}` : ''} (${stats.winPct.toFixed(1)}% win rate)` : 'No career record entered yet';
    const history = stats.entries.length ? stats.entries.map(entry =>
        `• **${entry.team}** — Seasons ${entry.startSeason}${Number(entry.endSeason) !== Number(entry.startSeason) ? `–${entry.endSeason}` : ''} · ${Number(entry.wins)||0}-${Number(entry.losses)||0}${Number(entry.ties) ? `-${entry.ties}` : ''}`
    ).join('\n').slice(0, 1024) : 'No previous coaching tenures recorded. Staff can add them with `/league coach-career`.';
    const seasonLines = seasonStats.seasons.slice(0, 8).map(row =>
        `• **Season ${row.season}** — ${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''} · ${(row.winPercentage * 100).toFixed(1)}% · ${row.pointDifferential >= 0 ? '+' : ''}${row.pointDifferential} PD`
    );
    const best = seasonStats.bestSeason;
    const seasonSummary = [
        best ? `**Best recorded season:** Season ${best.season} (${best.wins}-${best.losses}${best.ties ? `-${best.ties}` : ''}, ${(best.winPercentage * 100).toFixed(1)}%)` : '**Best recorded season:** No qualifying game history',
        seasonLines.length ? seasonLines.join('\n') : 'No season-by-season game records can be attributed to this coach yet.',
        `Based on ${seasonStats.gamesCounted} finalized game(s) during recorded coaching tenures${stats.team && !stats.entries.some(entry => normalizeCoachTeam(entry.team) === normalizeCoachTeam(stats.team)) ? ' or the current assigned team in the current season' : ''}.`
    ].join('\n');
    const embed = new EmbedBuilder().setColor(0x243447)
        .setTitle(`🏈 Coach Profile · ${profile.title || coach.username || 'BLACKLINE Coach'}`)
        .setDescription(profile.bio || '_This coach has not added a biography yet._')
        .addFields(
            { name: 'Coach', value: `<@${coach.userId}>`, inline: true },
            { name: 'Current Program', value: stats.team ? `${getTeamEmoji(dynasty, stats.team)} ${stats.team}` : 'No team selected', inline: true },
            { name: 'Career Record', value: record, inline: false },
            { name: 'Legacy Tier', value: `${legacy.tier} · ${legacy.score} points`, inline: true },
            { name: 'Career Milestones', value: [...legacy.milestones, ...careerMilestones.milestones].length ? [...legacy.milestones, ...careerMilestones.milestones].slice(0, 8).join('\n').slice(0, 1024) : 'Milestones unlock as verified career history is recorded.', inline: false },
            { name: 'Coaching History', value: history, inline: false },
            { name: 'Season-by-Season Record', value: seasonSummary.slice(0, 1024), inline: false },
            { name: 'National Titles', value: String(stats.titles), inline: true },
            { name: 'Conference Titles', value: String(stats.conferenceTitles), inline: true },
            { name: 'Players Drafted', value: String(stats.draftedPlayers), inline: true },
            { name: 'Heisman Winners', value: String(stats.heismanWinners), inline: true },
            { name: 'Other Awards', value: String(stats.otherAwards), inline: true },
            { name: 'Career Achievements', value: stats.achievements.length ? stats.achievements.join('\n').slice(0, 1024) : 'No career achievements matched the recorded coaching tenures yet.', inline: false },
            { name: 'Coaching Philosophy', value: profile.philosophy || '_Not provided yet._', inline: false }
        )
        .setFooter({ text: `${dynasty.name} • Career milestones use finalized games and recorded coaching tenures` });
    return embed;
}
function coachProfileModal(dynastyId, current = {}) {
    const modal = new ModalBuilder().setCustomId(`blackline_coach_profile_modal:${dynastyId}`).setTitle('Edit Coach Profile');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Coach title / nickname').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setValue(String(current.title || '').slice(0, 50))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bio').setLabel('Coaching background / biography').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(700).setValue(String(current.bio || '').slice(0, 700))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('philosophy').setLabel('Coaching philosophy').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setValue(String(current.philosophy || '').slice(0, 500)))
    );
    return modal;
}

module.exports = {
    handleCompetitionButton,
    handleScoreReviewButton,
    handleScoreReportModal,
    handleCoachProfileModal,
    handleCoachComponent,
    refreshCompetitionPanel,
    refreshHistoryPanel,
    refreshCoachCenterPanel,
    buildProgramProfileEmbed,
    data: new SlashCommandBuilder()
        .setName('league')
        .setDescription('Manage league schedules, results, standings, rankings, and championships.')
        .addSubcommand(s => s.setName('panel').setDescription('Create or refresh the public competition panel in this channel.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('history-panel').setDescription('Create or refresh the public league history panel in 📚・league-history.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('coach-panel').setDescription('Create or refresh the public coach profile panel in 🏟️・coach-center.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('coach-legacy').setDescription('Staff: rank registered coaches using recorded career results and achievements.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('coach-career').setDescription('Staff: add or update a coach career tenure without duplicating it.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('coach').setDescription('Coach Discord user ID').setRequired(true))
            .addStringOption(o => o.setName('team').setDescription('Program/team coached').setRequired(true))
            .addIntegerOption(o => o.setName('start-season').setDescription('First season at this program').setRequired(true).setMinValue(1).setMaxValue(100))
            .addIntegerOption(o => o.setName('end-season').setDescription('Last season at this program').setRequired(true).setMinValue(1).setMaxValue(100))
            .addIntegerOption(o => o.setName('wins').setDescription('Wins during this tenure').setRequired(true).setMinValue(0).setMaxValue(999))
            .addIntegerOption(o => o.setName('losses').setDescription('Losses during this tenure').setRequired(true).setMinValue(0).setMaxValue(999))
            .addIntegerOption(o => o.setName('ties').setDescription('Ties during this tenure').setRequired(false).setMinValue(0).setMaxValue(999)))
        .addSubcommand(s => s.setName('backup-create').setDescription('Staff: create a timestamped backup of all dynasty data.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('backup-list').setDescription('Staff: list recent database backups.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('audit-log').setDescription('Staff: review recent recorded changes for a dynasty.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('limit').setDescription('Number of entries (1–20)').setRequired(false).setMinValue(1).setMaxValue(20)))
        .addSubcommand(s => s.setName('history-record').setDescription('Add a historical champion, conference winner, Heisman, drafted player, award, or record.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('category').setDescription('Historical record category').setRequired(true).addChoices({name:'National Champion',value:'champion'},{name:'Conference Champion',value:'conference'},{name:'Heisman Winner',value:'heisman'},{name:'Drafted Player',value:'draft'},{name:'Other Award',value:'award'},{name:'Record or Honor',value:'record'}))
            .addIntegerOption(o => o.setName('season').setDescription('Season number').setRequired(true).setMinValue(1).setMaxValue(100))
            .addStringOption(o => o.setName('winner').setDescription('Winning player or team').setRequired(true))
            .addStringOption(o => o.setName('detail').setDescription('Conference, award name, runner-up, stat, or context').setRequired(false))
            .addStringOption(o => o.setName('team').setDescription("Player's team, if applicable").setRequired(false)))
        .addSubcommand(s => s.setName('roster-player').setDescription('Staff: add or update a player in a team roster.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('player').setDescription('Player full name').setRequired(true))
            .addStringOption(o => o.setName('team').setDescription('Registered team').setRequired(true))
            .addStringOption(o => o.setName('position').setDescription('Player position').setRequired(true).addChoices(...POSITIONS.map(v => ({name:v,value:v}))))
            .addStringOption(o => o.setName('class').setDescription('Class or eligibility year').setRequired(true).addChoices(...CLASSES.map(v => ({name:v,value:v}))))
            .addIntegerOption(o => o.setName('number').setDescription('Jersey number (0–99)').setRequired(false).setMinValue(0).setMaxValue(99))
            .addStringOption(o => o.setName('hometown').setDescription('Hometown (optional)').setRequired(false)))
        .addSubcommand(s => s.setName('recruit-prospect').setDescription('Staff: add or update a recruiting prospect for a team and season.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('player').setDescription('Prospect full name').setRequired(true))
            .addStringOption(o => o.setName('team').setDescription('Recruiting team').setRequired(true))
            .addStringOption(o => o.setName('position').setDescription('Prospect position').setRequired(true).addChoices(...POSITIONS.map(v => ({name:v,value:v}))))
            .addIntegerOption(o => o.setName('stars').setDescription('Recruit rating (1–5 stars)').setRequired(true).setMinValue(1).setMaxValue(5))
            .addIntegerOption(o => o.setName('season').setDescription('Recruiting class season').setRequired(true).setMinValue(1).setMaxValue(100))
            .addStringOption(o => o.setName('status').setDescription('Recruiting status').setRequired(true).addChoices({name:'Interested',value:'Interested'},{name:'Offered',value:'Offered'},{name:'Visiting',value:'Visiting'},{name:'Committed',value:'Committed'},{name:'Signed',value:'Signed'})))
        .addSubcommand(s => s.setName('roster-audit').setDescription('Staff: check roster and recruiting records for duplicates or invalid data.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('offseason-review').setDescription('Staff: preview roster progression and signed recruits before applying changes.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('offseason-advance').setDescription('Staff: apply player progression after season close; requires confirmation.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addBooleanOption(o => o.setName('confirm').setDescription('Confirm graduating seniors, advancing classes, and enrolling signed recruits').setRequired(true)))
        .addSubcommand(s => s.setName('report').setDescription('Submit a game score for manager approval.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('week').setDescription('Week number (0–15)').setRequired(true).setMinValue(0).setMaxValue(15))
            .addStringOption(o => o.setName('home').setDescription('Home team').setRequired(true))
            .addStringOption(o => o.setName('away').setDescription('Away team').setRequired(true))
            .addIntegerOption(o => o.setName('home-score').setDescription('Home team final score').setRequired(true).setMinValue(0).setMaxValue(300))
            .addIntegerOption(o => o.setName('away-score').setDescription('Away team final score').setRequired(true).setMinValue(0).setMaxValue(300)))
        .addSubcommand(s => s.setName('schedule-generate').setDescription('Generate a balanced no-rematch round-robin schedule for registered teams.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('weeks').setDescription('Number of regular-season weeks (1–15)').setRequired(true).setMinValue(1).setMaxValue(15)))
        .addSubcommand(s => s.setName('schedule-add').setDescription('Add a game to the current season schedule.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('week').setDescription('Week number (0–15)').setRequired(true).setMinValue(0).setMaxValue(15))
            .addStringOption(o => o.setName('home').setDescription('Home team').setRequired(true))
            .addStringOption(o => o.setName('away').setDescription('Away team').setRequired(true))
            .addStringOption(o => o.setName('kickoff').setDescription('Optional kickoff date/time in ISO format, e.g. 2026-10-10T19:30:00-05:00').setRequired(false)))
        .addSubcommand(s => s.setName('result').setDescription('Record or correct a final game score.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('week').setDescription('Week number (0–15)').setRequired(true).setMinValue(0).setMaxValue(15))
            .addStringOption(o => o.setName('home').setDescription('Home team').setRequired(true))
            .addStringOption(o => o.setName('away').setDescription('Away team').setRequired(true))
            .addIntegerOption(o => o.setName('home-score').setDescription('Home team final score').setRequired(true).setMinValue(0).setMaxValue(300))
            .addIntegerOption(o => o.setName('away-score').setDescription('Away team final score').setRequired(true).setMinValue(0).setMaxValue(300)))
        .addSubcommand(s => s.setName('schedule').setDescription('View the current season schedule and completed results.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addIntegerOption(o => o.setName('week').setDescription('Optional week filter (0–15)').setRequired(false).setMinValue(0).setMaxValue(15)))
        .addSubcommand(s => s.setName('standings').setDescription('Calculate standings from recorded final scores.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('rankings').setDescription('Set the league rankings/CFP Top 4.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('teams').setDescription('Ordered teams, separated by | or commas').setRequired(true)))
        .addSubcommand(s => s.setName('champion').setDescription('Record the season champion and championship score.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))
            .addStringOption(o => o.setName('team').setDescription('Champion team').setRequired(true))
            .addStringOption(o => o.setName('runner-up').setDescription('Runner-up team').setRequired(false))
            .addIntegerOption(o => o.setName('champion-score').setDescription('Champion final score (optional)').setRequired(false).setMinValue(0).setMaxValue(300))
            .addIntegerOption(o => o.setName('runner-up-score').setDescription('Runner-up final score (optional)').setRequired(false).setMinValue(0).setMaxValue(300)))
        .addSubcommand(s => s.setName('season-status').setDescription('Review season phase, schedule completion, and championship status.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('season-audit').setDescription('Check the current season schedule and results for conflicts or invalid records.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true)))
        .addSubcommand(s => s.setName('player-history-audit').setDescription('Staff: check existing draft, Heisman, award, and conference-title history for issues.')
            .addStringOption(o => o.setName('name').setDescription('Dynasty name').setRequired(true))),








    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand !== 'report' && !isManager(interaction)) return interaction.reply({ content: `🔒 League operations require one of these roles: **${MANAGER_ROLES.join('**, **')}**.`, ephemeral: true });
        const database = loadDatabase();
        const name = interaction.options.getString('name').trim();
        const dynasty = findDynasty(database, name);
        if (!dynasty || dynasty.status !== 'active') return interaction.reply({ content: `❌ I could not find an active dynasty named **${name}**.`, ephemeral: true });
        ensureLeagueData(dynasty);


        if (subcommand === 'report') return reportScore(interaction, dynasty);

        if (subcommand === 'backup-create') {
            const backup = createDatabaseBackup(database);
            appendAuditEntry(dynasty, { action: 'database-backup-created', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { file: backup.fileName, bytes: backup.bytes } });
            saveDatabase(database);
            return interaction.reply({ content: `✅ Backup created: **${backup.fileName}** (${backup.bytes.toLocaleString()} bytes). It contains all dynasties, not just this league. Keep a separate copy off the bot host for disaster recovery.`, ephemeral: true });
        }
        if (subcommand === 'backup-list') {
            const backups = listDatabaseBackups(8);
            const body = backups.length ? backups.map((b, i) => `**${i + 1}.** \`${b.fileName}\` — ${new Date(b.createdAt).toLocaleString()} — ${(b.bytes / 1024).toFixed(1)} KB`) : 'No backups have been created yet.';
            return interaction.reply({ content: `🗄️ **Recent BLACKLINE Backups**\n${body.join ? body.join('\n') : body}\n\nBackups are not automatically restored; verify a backup before any recovery.`, ephemeral: true });
        }
        if (subcommand === 'audit-log') {
            const limit = interaction.options.getInteger('limit') || 10;
            const entries = (dynasty.staffAuditLog || []).slice(-limit).reverse();
            const body = entries.length ? entries.map(formatAuditEntry).join('\n').slice(0, 3800) : 'No audit entries recorded yet. New safeguards record selected staff operations; this is not a retroactive log of older actions.';
            return interaction.reply({ content: `🧾 **${dynasty.name} — Recent Staff Audit**\n${body}`, ephemeral: true });
        }

        if (subcommand === 'roster-player') {
            const team = interaction.options.getString('team').trim();
            const registered = [...(dynasty.teamSelections || []).map(s => s.team), ...(dynasty.teams || [])];
            if (!registered.some(t => normalizeTeam(t) === normalizeTeam(team))) return interaction.reply({ content: '❌ That team is not registered in this dynasty. Register/select the team before adding roster players.', ephemeral: true });
            const result = upsertPlayer(dynasty, { name: interaction.options.getString('player'), team, position: interaction.options.getString('position'), classYear: interaction.options.getString('class'), number: interaction.options.getInteger('number'), hometown: interaction.options.getString('hometown') }, interaction.user.id);
            if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
            appendAuditEntry(dynasty, { action: result.created ? 'roster-player-added' : 'roster-player-updated', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { player: result.player.name, team, position: result.player.position, classYear: result.player.classYear } });
            saveDatabase(database);
            return interaction.reply({ content: `✅ ${result.created ? 'Added' : 'Updated'} **${result.player.name}** on **${team}** (${result.player.position}, ${result.player.classYear}). Public Team Rosters view is updated automatically.`, ephemeral: true });
        }
        if (subcommand === 'recruit-prospect') {
            const team = interaction.options.getString('team').trim();
            const registered = [...(dynasty.teamSelections || []).map(s => s.team), ...(dynasty.teams || [])];
            if (!registered.some(t => normalizeTeam(t) === normalizeTeam(team))) return interaction.reply({ content: '❌ That team is not registered in this dynasty.', ephemeral: true });
            const prospectName = interaction.options.getString('player');
            const prospectSeason = interaction.options.getInteger('season');
            const requestedStatus = interaction.options.getString('status');
            const previous = (dynasty.recruitingProspects || []).find(p => normalizeTeam(p.name) === normalizeTeam(prospectName) && normalizeTeam(p.team) === normalizeTeam(team) && Number(p.season) === Number(prospectSeason));
            const previousStatus = previous?.status || null;
            const result = upsertProspect(dynasty, { name: prospectName, team, position: interaction.options.getString('position'), stars: interaction.options.getInteger('stars'), season: prospectSeason, status: requestedStatus }, interaction.user.id);
            if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
            appendAuditEntry(dynasty, { action: result.created ? 'recruit-prospect-added' : 'recruit-prospect-updated', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { player: result.prospect.name, team, season: result.prospect.season, stars: result.prospect.stars, status: result.prospect.status } });
            saveDatabase(database);
            if (String(result.prospect.status).toLocaleLowerCase() === 'signed' && String(previousStatus || '').toLocaleLowerCase() !== 'signed') {
                await publishLeagueNotification(interaction.client, database, dynasty, {
                    type: 'signing',
                    key: `signing:s${result.prospect.season}:${normalizeTeam(team)}:${normalizeTeam(result.prospect.name)}`,
                    title: `✍️ ${result.prospect.name} signs with ${team}`,
                    description: `**${result.prospect.name}** (${result.prospect.position}, ${result.prospect.stars} stars) is recorded as signed with **${team}** for recruiting Season ${result.prospect.season}.`
                });
            }
            return interaction.reply({ content: `✅ ${result.created ? 'Added' : 'Updated'} ${'⭐'.repeat(result.prospect.stars)} **${result.prospect.name}** for **${team}**, Season ${result.prospect.season} (${result.prospect.status}).`, ephemeral: true });
        }
        if (subcommand === 'roster-audit') {
            ensureRosterData(dynasty);
            const findings = [];
            for (const [label, records] of [['Roster', dynasty.rosterPlayers], ['Recruiting', dynasty.recruitingProspects]]) {
                const seen = new Set();
                records.forEach((r, i) => {
                    if (!String(r.name || '').trim() || !String(r.team || '').trim()) findings.push(`⚠️ ${label} record #${i + 1}: missing player or team name.`);
                    const key = `${normalizeTeam(r.name)}|${normalizeTeam(r.team)}|${label === 'Recruiting' ? Number(r.season) : ''}`;
                    if (seen.has(key)) findings.push(`⚠️ ${label}: duplicate-looking entry for **${r.name || 'Unknown'}** at **${r.team || 'Unknown'}**.`);
                    seen.add(key);
                    if (label === 'Recruiting' && (!Number.isInteger(Number(r.stars)) || Number(r.stars) < 1 || Number(r.stars) > 5)) findings.push(`❌ Recruiting: invalid star rating for **${r.name || 'Unknown'}**.`);
                });
            }
            return interaction.reply({ content: `🔎 **${dynasty.name} — Roster & Recruiting Audit**\n${findings.slice(0, 25).join('\n') || '✅ No basic roster/recruiting integrity issues found.'}\n\nRead-only: no records were changed.`, ephemeral: true });
        }

        if (subcommand === 'offseason-review') {
            const plan = previewOffseason(dynasty);
            const lines = [
                `Current season: **${plan.fromSeason}** → next roster season: **${plan.toSeason}**`,
                `Players advancing a class: **${plan.advancing.length}**`,
                `Players graduating/archiving: **${plan.graduating.length}**`,
                `Signed recruits ready to enroll: **${plan.signedProspects.length}**`,
                `Unknown class-year records: **${plan.unknown.length}**`,
                `Duplicate signed prospects: **${plan.duplicateSignings.length}**`,
                `Already applied: **${plan.alreadyApplied ? 'Yes' : 'No'}**`
            ];
            if (!dynasty.seasonClosed) lines.push('⚠️ Close the current season before applying progression.');
            if (plan.unknown.length) lines.push(`⚠️ Review unknown class years: ${plan.unknown.slice(0, 8).map(p => p.name).join(', ')}`);
            if (plan.duplicateSignings.length) lines.push('⚠️ Resolve duplicate signed prospect records before applying.');
            return interaction.reply({ content: `📋 **${dynasty.name} — Offseason Review**\n${lines.join('\n')}\n\nPreview only: no roster records were changed.`, ephemeral: true });
        }
        if (subcommand === 'offseason-advance') {
            if (!interaction.options.getBoolean('confirm')) return interaction.reply({ content: '❌ Set confirm:true to apply offseason progression. No changes were made.', ephemeral: true });
            const result = applyOffseason(dynasty, interaction.user.id);
            if (result.error) return interaction.reply({ content: `❌ ${result.error} Run \`/league offseason-review name:${dynasty.name}\` first.`, ephemeral: true });
            appendAuditEntry(dynasty, { action: 'offseason-progression-applied', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { fromSeason: result.transition.fromSeason, toSeason: result.transition.toSeason, graduated: result.transition.graduated, advanced: result.transition.advanced, enrolled: result.transition.enrolled } });
            saveDatabase(database);
            await publishLeagueNotification(interaction.client, database, dynasty, { type: 'offseason', key: `offseason:s${result.transition.fromSeason}-to-s${result.transition.toSeason}`, title: `🔄 ${dynasty.name} · Offseason Transition`, description: `Roster transition completed.\n• Players graduated/archived: **${result.transition.graduated}**\n• Players advanced: **${result.transition.advanced}**\n• Signed recruits enrolled: **${result.transition.enrolled}**` });
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            await refreshHistoryPanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ **Offseason progression applied for ${dynasty.name}.**\n• Graduated and archived: **${result.transition.graduated}**\n• Advanced class year: **${result.transition.advanced}**\n• Signed recruits enrolled: **${result.transition.enrolled}**\n\nThis transition cannot be applied twice. Review the roster, then use \`/league season-start name:${dynasty.name}\` when ready.`, ephemeral: true });
        }

        if (subcommand === 'coach-legacy') {
            const coaches = (dynasty.coaches || []).map(coach => ({
                name: coach.username || `Coach ${String(coach.userId || '').slice(-4)}`,
                userId: coach.userId,
                stats: coachCareerStats(dynasty, coach.userId)
            }));
            const ranked = rankCoachLegacy(coaches);
            const lines = ranked.slice(0, 20).map((coach, index) => {
                const s = coach.stats;
                return `**${index + 1}.** <@${coach.userId}> — **${coach.legacy.tier}** · ${coach.legacy.score} legacy pts · ${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''} · ${s.titles} national title(s)`;
            });
            return interaction.reply({ content: `🏛️ **${dynasty.name} — Coach Legacy Rankings**\n${lines.join('\n') || 'No registered coaches yet.'}\n\nRankings use recorded coaching tenures, win-loss records, titles, Heisman winners, draft picks, and awards. Missing historical data is not inferred.`, ephemeral: true, allowedMentions: { parse: [] } });
        }

        if (subcommand === 'coach-career') {
            const coachId = interaction.options.getString('coach').trim().replace(/[<@!>]/g, '');
            if (!(dynasty.coaches || []).some(coach => coach.userId === coachId)) {
                return interaction.reply({ content: '❌ That Discord user is not a registered coach in this dynasty.', ephemeral: true });
            }
            const team = interaction.options.getString('team').trim();
            const startSeason = interaction.options.getInteger('start-season');
            const endSeason = interaction.options.getInteger('end-season');
            if (endSeason < startSeason) return interaction.reply({ content: '❌ End season must be the same as or later than start season.', ephemeral: true });
            const entries = coachCareerEntries(dynasty, coachId);
            const keyTeam = normalizeCoachTeam(team);
            const existing = entries.find(entry => normalizeCoachTeam(entry.team) === keyTeam && Number(entry.startSeason) === startSeason);
            const entry = { team, startSeason, endSeason, wins: interaction.options.getInteger('wins'), losses: interaction.options.getInteger('losses'), ties: interaction.options.getInteger('ties') || 0, updatedAt: new Date().toISOString(), updatedBy: interaction.user.id };
            if (existing) Object.assign(existing, entry); else entries.push({ ...entry, createdAt: new Date().toISOString() });
            appendAuditEntry(dynasty, { action: existing ? 'coach-career-updated' : 'coach-career-created', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { coachId, team, startSeason, endSeason } });
            saveDatabase(database);
            const coach = dynasty.coaches.find(item => item.userId === coachId);
            const channel = dynasty.coachCenterChannelId ? await interaction.client.channels.fetch(dynasty.coachCenterChannelId).catch(() => null) : null;
            const panel = channel?.isTextBased() && dynasty.coachCenterMessageId ? await channel.messages.fetch(dynasty.coachCenterMessageId).catch(() => null) : null;
            if (panel) await panel.edit({ embeds: [coachPanelEmbed(dynasty, 0)], components: coachPanelComponents(dynasty, 0), allowedMentions: { parse: [] } }).catch(() => {});
            return interaction.reply({ content: `✅ ${existing ? 'Updated' : 'Recorded'} ${coach.username || `<@${coachId}>`}'s ${team} tenure (Seasons ${startSeason}–${endSeason}). Re-running this entry updates it instead of creating a duplicate.`, embeds: [coachProfileEmbed(dynasty, coach)], ephemeral: true, allowedMentions: { parse: [] } });
        }

        if (subcommand === 'season-status') {
            const games = currentSeasonGames(dynasty);
            const finalGames = games.filter(g => g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore));
            const unresolved = games.length - finalGames.length;
            const champion = (dynasty.championshipHistory || []).find(h => Number(h.season) === Number(dynasty.season));
            const phase = dynasty.currentPhaseLabel || dynasty.currentPhase || 'Off-Season';
            const embed = new EmbedBuilder().setColor(0x243447)
                .setTitle(`🗓️ ${dynasty.name} · Season ${dynasty.season} Status`)
                .addFields(
                    { name: 'Phase', value: String(phase), inline: true },
                    { name: 'Schedule', value: `${finalGames.length}/${games.length} games final${unresolved ? `\n${unresolved} unresolved` : ''}`, inline: true },
                    { name: 'Championship', value: champion ? `🏆 ${champion.champion}${champion.runnerUp ? ` over ${champion.runnerUp}` : ''}` : 'Not finalized', inline: true },
                    { name: 'Season State', value: dynasty.seasonClosed ? `Closed${dynasty.seasonClosedAt ? ` on ${new Date(dynasty.seasonClosedAt).toLocaleDateString('en-US')}` : ''}` : 'Open', inline: true }
                );
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'player-history-audit') {
            const audit = auditPlayerHistory(dynasty);
            const summary = playerHistoryAuditSummary(audit);
            const body = `**Errors:** ${audit.counts.errors} · **Warnings:** ${audit.counts.warnings}\n\n${summary}`.slice(0, 3900);
            return interaction.reply({ content: `🧾 **${dynasty.name} — Player History Audit**\n${body}\n\nRead-only: no records were changed or deleted. Review findings before correcting entries with the existing \`/league history-record\` workflow.`, ephemeral: true });
        }

        if (subcommand === 'season-audit') {
            const audit = auditSeasonSchedule(dynasty, dynasty.season);
            const lines = audit.findings.slice(0, 20).map(f => `${f.severity === 'error' ? '❌' : '⚠️'} ${f.message}`);
            const summary = `Season ${audit.season} · ${audit.games} games · ${audit.errors} error(s) · ${audit.warnings} warning(s)`;
            return interaction.reply({ content: `🔎 **${dynasty.name} — Season Integrity Audit**\n${summary}\n\n${lines.length ? lines.join('\n').slice(0, 3500) : '✅ No schedule integrity issues found.'}${audit.findings.length > 20 ? `\n…plus ${audit.findings.length - 20} more finding(s).` : ''}`, ephemeral: true });
        }

        if (subcommand === 'season-close') {
            if (dynasty.seasonClosed) return interaction.reply({ content: `Season ${dynasty.season} is already closed.`, ephemeral: true });
            const closeError = seasonCloseError(dynasty);
            if (closeError) return interaction.reply({ content: `❌ ${closeError}\nRun \`/league season-audit name:${dynasty.name}\` for schedule issues.`, ephemeral: true });
            const games = currentSeasonGames(dynasty);
            const champion = (dynasty.championshipHistory || []).find(h => Number(h.season) === Number(dynasty.season));
            const archiveResult = prepareSeasonArchive(dynasty, {
                closedAt: new Date().toISOString(), closedBy: interaction.user.id,
                standings: standingsFor(dynasty), games
            });
            if (archiveResult.error) {
                return interaction.reply({ content: `❌ ${archiveResult.error} No historical records were changed. Review the existing archive before retrying.`, ephemeral: true });
            }
            if (!Array.isArray(dynasty.seasonArchives)) dynasty.seasonArchives = [];
            dynasty.seasonArchives.push(archiveResult.archive);
            appendAuditEntry(dynasty, { action: 'season-closed', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, champion: champion.champion, games: games.length } });
            dynasty.seasonClosed = true;
            dynasty.seasonClosedAt = new Date().toISOString();
            dynasty.seasonClosedBy = interaction.user.id;
            dynasty.currentPhase = 'offseason';
            dynasty.currentPhaseLabel = 'Off-Season';
            saveDatabase(database);
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            await refreshHistoryPanel(interaction.client, dynasty);
            return interaction.reply({ content: `🏁 **Season ${dynasty.season} is officially closed.**\nChampion: **${champion.champion}**\nFinalized games: **${games.length}**\nStandings and the playoff bracket have been archived. Historical game records remain intact. Use \`/league season-start name:${dynasty.name}\` when you're ready to begin the next season.`, ephemeral: true });
        }

        if (subcommand === 'season-start') {
            if (!dynasty.seasonClosed) return interaction.reply({ content: `❌ Close Season ${dynasty.season} first with \`/league season-close name:${dynasty.name}\`. This protects the current season's records.`, ephemeral: true });
            const previousSeason = Number(dynasty.season);
            dynasty.season = previousSeason + 1;
            dynasty.seasonYear = Number(dynasty.seasonYear || new Date().getFullYear()) + 1;
            dynasty.currentWeek = 0;
            dynasty.currentPhase = 'regular-season';
            dynasty.currentPhaseLabel = 'Regular Season';
            dynasty.seasonClosed = false;
            dynasty.seasonStartedAt = new Date().toISOString();
            dynasty.seasonStartedBy = interaction.user.id;
            dynasty.playoffBracket = null;
            dynasty.lastSeasonTransition = { fromSeason: previousSeason, toSeason: dynasty.season, transitionedAt: dynasty.seasonStartedAt, transitionedBy: interaction.user.id };
            appendAuditEntry(dynasty, { action: 'season-started', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { fromSeason: previousSeason, toSeason: dynasty.season, year: dynasty.seasonYear } });
            saveDatabase(database);
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            await refreshHistoryPanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ **Season ${dynasty.season} has started** for **${dynasty.name}**.\n• Previous-season games, standings archive, champion, and championship history are preserved.\n• The new season has no schedule yet. Generate one with \`/league schedule-generate\`.\n• Team registrations and conference assignments are retained for continuity; review them before generating the new schedule.`, ephemeral: true });
        }

        if (subcommand === 'conference-set') {
            const team = interaction.options.getString('team').trim();
            const conference = interaction.options.getString('conference').trim();
            const knownTeams = orderedLeagueTeams(dynasty);
            if (!knownTeams.some(known => normalizeTeam(known) === normalizeTeam(team))) {
                return interaction.reply({ content: `❌ **${team}** is not in this dynasty's rankings, standings, or team selections. Register/select the team first.`, ephemeral: true });
            }
            if (!conference) return interaction.reply({ content: '❌ Conference name cannot be empty.', ephemeral: true });
            if (!dynasty.teamConferences || Array.isArray(dynasty.teamConferences)) dynasty.teamConferences = {};
            const previousConference = dynasty.teamConferences[normalizeTeam(team)] || 'unassigned';
            dynasty.teamConferences[normalizeTeam(team)] = conference;
            appendAuditEntry(dynasty, { action: 'conference-assigned', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { team, from: previousConference, to: conference } });
            saveDatabase(database);
            await updateAllDashboards(interaction.client);
            return interaction.reply({ content: `✅ Assigned **${team}** to the **${conference}** conference. Run \`/league playoff-qualify name:${dynasty.name}\` after conference assignments and regular-season results are ready.`, ephemeral: true });
        }
        if (subcommand === 'playoff-qualify') {
            const replacementError = bracketReplacementError(dynasty.playoffBracket, dynasty.season);
            if (replacementError) return interaction.reply({ content: `❌ ${replacementError}`, ephemeral: true });
            const qualification = qualifyPlayoffTeams(dynasty);
            if (qualification.error) return interaction.reply({ content: `❌ ${qualification.error}`, ephemeral: true });
            const bracket = buildPlayoffBracket(dynasty, qualification.teams);
            if (bracket.error) return interaction.reply({ content: `❌ ${bracket.error}`, ephemeral: true });
            bracket.createdBy = interaction.user.id;
            bracket.qualification = {
                automaticBids: qualification.automatic,
                atLargeBids: qualification.atLarge,
                conferenceChampions: qualification.conferenceChampions,
                conferences: qualification.conferences,
                method: 'five-conference-champion automatic bids, then at-large by rankings/standings'
            };
            const replacedBracket = !!dynasty.playoffBracket;
            dynasty.playoffBracket = bracket;
            appendAuditEntry(dynasty, { action: 'playoff-qualified', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, teams: qualification.teams.length, replacedBracket } });
            saveDatabase(database);
            await refreshCompetitionPanel(interaction.client, dynasty);
            const automaticText = qualification.automatic.map(team => `• ${team}`).join('\n') || 'None';
            const atLargeText = qualification.atLarge.map(team => `• ${team}`).join('\n');
            const embed = new EmbedBuilder().setColor(0x243447).setTitle(`${dynasty.name} · Season ${dynasty.season} Playoff Qualifiers`)
                .setDescription('A 12-team bracket has been created. The four highest-ranked conference champions (or available qualifiers if fewer than four conferences are assigned) receive first-round byes.')
                .addFields(
                    { name: 'Conference Champion Automatic Bids', value: automaticText.slice(0, 1024), inline: true },
                    { name: 'At-Large Bids', value: atLargeText.slice(0, 1024), inline: true },
                    { name: '12-Team Bracket', value: qualification.teams.map((team, i) => `**${i + 1}.** ${team}`).join('\n').slice(0, 1024), inline: false }
                );
            return interaction.reply({ embeds: [embed, playoffBracketEmbed(dynasty)], content: '✅ Playoff field selected and bracket created. An unplayed bracket may be recreated; finalized playoff results are protected.', ephemeral: true });
        }
        if (subcommand === 'playoff-setup') {
            const replacementError = bracketReplacementError(dynasty.playoffBracket, dynasty.season);
            if (replacementError) return interaction.reply({ content: `❌ ${replacementError}`, ephemeral: true });
            const bracket = buildPlayoffBracket(dynasty);
            if (bracket.error) return interaction.reply({ content: `❌ ${bracket.error}`, ephemeral: true });
            bracket.createdBy = interaction.user.id;
            const replacedBracket = !!dynasty.playoffBracket;
            dynasty.playoffBracket = bracket;
            appendAuditEntry(dynasty, { action: 'playoff-bracket-created', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, replacedBracket } });
            saveDatabase(database);
            await refreshCompetitionPanel(interaction.client, dynasty);
            return interaction.reply({ embeds: [playoffBracketEmbed(dynasty)], content: '✅ Playoff bracket created. An unplayed bracket may be recreated; finalized playoff results are protected.', ephemeral: true });
        }
        if (subcommand === 'playoff-bracket') {
            return interaction.reply({ embeds: [playoffBracketEmbed(dynasty)], ephemeral: true });
        }
        if (subcommand === 'playoff-result') {
            if (dynasty.seasonClosed) return interaction.reply({ content: '❌ This season is closed; playoff results are locked.', ephemeral: true });
            const result = recordPlayoffResult(
                dynasty,
                interaction.options.getInteger('round'),
                interaction.options.getString('home').trim(),
                interaction.options.getString('away').trim(),
                interaction.options.getInteger('home-score'),
                interaction.options.getInteger('away-score')
            );
            if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
            appendAuditEntry(dynasty, { action: 'playoff-result-recorded', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, round: interaction.options.getInteger('round'), home: result.game.homeTeam, away: result.game.awayTeam, homeScore: result.game.homeScore, awayScore: result.game.awayScore, champion: result.champion || '' } });
            if (result.champion) {
                if (!Array.isArray(dynasty.championshipHistory)) dynasty.championshipHistory = [];
                dynasty.championshipHistory = dynasty.championshipHistory.filter(h => Number(h.season) !== Number(dynasty.season));
                dynasty.championshipHistory.push({
                    season: dynasty.season, year: dynasty.seasonYear, champion: result.champion,
                    runnerUp: result.game.homeScore > result.game.awayScore ? result.game.awayTeam : result.game.homeTeam,
                    championScore: Math.max(result.game.homeScore, result.game.awayScore),
                    runnerUpScore: Math.min(result.game.homeScore, result.game.awayScore),
                    recordedAt: new Date().toISOString(), source: 'playoff-bracket'
                });
                dynasty.defendingChampion = result.champion;
            }
            saveDatabase(database);
            const playoffKey = `playoff:s${dynasty.season}:r${interaction.options.getInteger('round')}:${normalizeTeam(result.game.homeTeam)}:${normalizeTeam(result.game.awayTeam)}:${result.game.homeScore}-${result.game.awayScore}`;
            await publishLeagueNotification(interaction.client, database, dynasty, { type: 'playoff', key: playoffKey, title: `🏈 ${dynasty.name} · Playoff Result`, description: `Season ${dynasty.season} · Round ${interaction.options.getInteger('round')}\n**${result.game.homeTeam} ${result.game.homeScore} — ${result.game.awayScore} ${result.game.awayTeam}**\n${result.champion ? `🏆 **${result.champion}** are the champions!` : `**${result.game.winner}** advance to the next round.`}` });
            if (result.champion) await publishLeagueNotification(interaction.client, database, dynasty, { type: 'champion', key: `champion:s${dynasty.season}:${normalizeTeam(result.champion)}`, title: `🏆 ${dynasty.name} · Season ${dynasty.season} Champions`, description: `**${result.champion}** have won the national championship.` });
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            await refreshHistoryPanel(interaction.client, dynasty);
            const outcome = result.champion ? `🏆 **${result.champion}** wins the championship!` : `**${result.game.winner}** advances to the next round.`;
            return interaction.reply({ content: `✅ Playoff result recorded: **${result.game.homeTeam} ${result.game.homeScore}–${result.game.awayScore} ${result.game.awayTeam}**. ${outcome}`, embeds: [playoffBracketEmbed(dynasty)], ephemeral: true });
        }

        if (subcommand === 'history-record') {
            const category = interaction.options.getString('category');
            const season = interaction.options.getInteger('season');
            const winner = interaction.options.getString('winner').trim();
            const detail = interaction.options.getString('detail')?.trim() || '';
            const team = interaction.options.getString('team')?.trim() || '';
            const identity = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
            const year = Number(dynasty.seasonYear) - Number(dynasty.season) + season;
            const base = { season, year, recordedBy: interaction.user.id, recordedAt: new Date().toISOString() };
            if (category === 'champion') {
                if (!Array.isArray(dynasty.championshipHistory)) dynasty.championshipHistory = [];
                const old = dynasty.championshipHistory.find(r => Number(r.season) === season);
                const record = { ...base, champion: winner, ...(detail ? { runnerUp: detail } : {}) };
                if (old) Object.assign(old, record); else dynasty.championshipHistory.push(record);
            } else {
                const key = category === 'conference' ? 'conferenceChampionsHistory' : category === 'heisman' ? 'heismanHistory' : category === 'draft' ? 'draftHistory' : category === 'award' ? 'awardHistory' : 'recordHistory';
                if (!Array.isArray(dynasty[key])) dynasty[key] = [];
                const record = category === 'conference'
                    ? { ...base, conference: detail || 'Conference not specified', champion: winner, team }
                    : category === 'heisman'
                        ? { ...base, winner, player: winner, team, detail }
                        : category === 'draft'
                            ? { ...base, player: winner, winner, team, detail }
                            : category === 'award'
                            ? { ...base, award: detail || 'Award not specified', winner, recipient: winner, team }
                            : { ...base, category: detail || 'Record or honor', holder: winner, recipient: winner, team };
                const existing = dynasty[key].find(r => Number(r.season) === season &&
                    identity(r.player || r.winner || r.recipient || r.champion || r.team || r.holder) === identity(winner) &&
                    normalizeTeam(String(r.team || '')) === normalizeTeam(team) &&
                    (category !== 'award' || identity(r.award || r.type) === identity(record.award)) &&
                    (category !== 'conference' || identity(r.conference) === identity(record.conference)) &&
                    (category !== 'record' || identity(r.category || r.record) === identity(record.category)));
                if (existing) Object.assign(existing, record); else dynasty[key].push(record);
            }
            appendAuditEntry(dynasty, { action: 'history-recorded', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { category, season, winner, team } });
            saveDatabase(database);
            if (category === 'champion' || category === 'conference' || category === 'heisman' || category === 'award') {
                await publishLeagueNotification(interaction.client, database, dynasty, { type: category === 'champion' ? 'champion' : 'award', key: `history:${category}:s${season}:${identity(winner)}:${identity(detail)}:${identity(team)}`, title: `🏅 ${dynasty.name} · Season ${season} ${category === 'champion' ? 'Champion' : category === 'conference' ? 'Conference Champion' : category === 'heisman' ? 'Heisman Winner' : 'Award'}`, description: `**${winner}**${team ? ` · ${team}` : ''}${detail ? `\n${detail}` : ''}` });
            }
            await refreshHistoryPanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ Recorded **${winner}** in the **${category}** history for Season ${season}. Coach Center statistics and the 📚・league-history panel will reflect the recorded data.`, ephemeral: true });
        }

        if (subcommand === 'coach-panel') {
            const channel = interaction.channel;
            if (!channel || !channel.isTextBased() || channel.name !== '🏟️・coach-center') {
                return interaction.reply({ content: '❌ Run this command in the 🏟️・coach-center text channel.', ephemeral: true });
            }
            let message = null;
            if (dynasty.coachCenterChannelId === channel.id && dynasty.coachCenterMessageId) {
                message = await channel.messages.fetch(dynasty.coachCenterMessageId).catch(() => null);
            }
            const page = 0;
            const payload = { embeds: [coachPanelEmbed(dynasty, page)], components: coachPanelComponents(dynasty, page), allowedMentions: { parse: [] } };
            if (message) await message.edit(payload);
            else message = await channel.send(payload);
            dynasty.coachCenterChannelId = channel.id;
            dynasty.coachCenterMessageId = message.id;
            saveDatabase(database);
            return interaction.reply({ content: `✅ Coach Center panel created or refreshed in <#${channel.id}> for **${dynasty.name}**.`, ephemeral: true });
        }

        if (subcommand === 'history-panel') {
            const channel = interaction.channel;
            if (!channel || !channel.isTextBased() || !/league-history/i.test(channel.name || '')) {
                return interaction.reply({ content: '❌ Run this command in the 📚・league-history text channel.', ephemeral: true });
            }
            let message = null;
            if (dynasty.historyChannelId === channel.id && dynasty.historyMessageId) {
                message = await channel.messages.fetch(dynasty.historyMessageId).catch(() => null);
            }
            const payload = { embeds: [buildHistoryPanelEmbed(dynasty)], components: buildHistoryPanelButtons(dynasty.id) };
            if (message) await message.edit(payload);
            else message = await channel.send(payload);
            dynasty.historyChannelId = channel.id;
            dynasty.historyMessageId = message.id;
            dynasty.guildId = interaction.guildId;
            saveDatabase(database);
            return interaction.reply({ content: `✅ League history panel created or refreshed in <#${channel.id}> for **${dynasty.name}**.`, ephemeral: true });
        }

        if (subcommand === 'panel') {
            if (!interaction.channel || !interaction.channel.isTextBased()) {
                return interaction.reply({ content: '❌ Run this command in the 🏆・competition text channel.', ephemeral: true });
            }
            const channel = interaction.channel;
            const embed = buildCompetitionPanelEmbed(dynasty);
            const components = buildCompetitionPanelButtons(dynasty.id);
            let message = null;
            if (dynasty.competitionChannelId === channel.id && dynasty.competitionMessageId) {
                message = await channel.messages.fetch(dynasty.competitionMessageId).catch(() => null);
            }
            if (message) {
                await message.edit({ content: '', embeds: [embed], components });
            } else {
                message = await channel.send({ embeds: [embed], components });
            }
            dynasty.competitionChannelId = channel.id;
            dynasty.competitionMessageId = message.id;
            dynasty.guildId = interaction.guildId;
            saveDatabase(database);
            return interaction.reply({ content: `✅ Competition panel created or refreshed in <#${channel.id}> for **${dynasty.name}**.`, ephemeral: true });
        }

        if (subcommand === 'schedule-generate') {
            if (dynasty.seasonClosed) return interaction.reply({ content: '❌ This season is closed. Start the next season before generating a schedule.', ephemeral: true });
            const weeks = interaction.options.getInteger('weeks');
            const existing = currentSeasonGames(dynasty);
            if (existing.length) {
                return interaction.reply({ content: `❌ Season ${dynasty.season} already has ${existing.length} scheduled or completed game(s). The generator will not overwrite existing games or scores. Clear/finish the current schedule first, or continue adding games manually.`, ephemeral: true });
            }
            const result = generateRoundRobinSchedule(orderedLeagueTeams(dynasty), weeks, dynasty, interaction.user.id);
            if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
            dynasty.scheduleGames.push(...result.games);
            appendAuditEntry(dynasty, { action: 'schedule-generated', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, weeks, teams: result.teams.length, games: result.games.length } });
            saveDatabase(database);
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            const gamesPerWeek = Math.floor(result.teams.length / 2);
            const byes = result.teams.length % 2;
            return interaction.reply({
                content: `✅ Generated **${result.games.length} games** for **${dynasty.name} · Season ${dynasty.season}**.\n• Teams: **${result.teams.length}**\n• Weeks: **1–${result.weeks}**\n• Games per week: **${gamesPerWeek}**${byes ? `\n• Bye: one team each week` : ''}\n• Opponents: no rematches within the generated weeks\n• Kickoff times: unset; add dates manually if needed.`,
                ephemeral: true
            });
        }

        if (subcommand === 'schedule-add') {
            if (dynasty.seasonClosed) return interaction.reply({ content: '❌ This season is closed. Start the next season before adding games.', ephemeral: true });
            const week = interaction.options.getInteger('week');
            const home = interaction.options.getString('home').trim();
            const away = interaction.options.getString('away').trim();
            const kickoffRaw = interaction.options.getString('kickoff');
            if (normalizeTeam(home) === normalizeTeam(away)) return interaction.reply({ content: '❌ Home and away teams must be different.', ephemeral: true });
            let kickoff = null;
            if (kickoffRaw) {
                const date = new Date(kickoffRaw);
                if (Number.isNaN(date.getTime())) return interaction.reply({ content: '❌ Invalid kickoff date. Use ISO format such as `2026-10-10T19:30:00-05:00`.', ephemeral: true });
                kickoff = date.toISOString();
            }
            const scheduleError = validateScheduledGame(dynasty, { week, homeTeam: home, awayTeam: away });
            if (scheduleError) return interaction.reply({ content: `❌ ${scheduleError}`, ephemeral: true });
            const knownTeams = orderedLeagueTeams(dynasty);
            if (!knownTeams.some(team => normalizeTeam(team) === normalizeTeam(home)) || !knownTeams.some(team => normalizeTeam(team) === normalizeTeam(away))) {
                return interaction.reply({ content: '❌ Both teams must already be registered or appear in this dynasty’s league records. Add/select the teams before scheduling a matchup.', ephemeral: true });
            }
            dynasty.scheduleGames.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, season: dynasty.season, week, homeTeam: home, awayTeam: away, kickoff, status: 'scheduled', createdBy: interaction.user.id, createdAt: new Date().toISOString() });
            appendAuditEntry(dynasty, { action: 'schedule-game-added', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, week, home, away, kickoff: kickoff || 'unset' } });
            saveDatabase(database);
            await refreshCompetitionPanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ Added **${away} at ${home}** to **${dynasty.name} · Season ${dynasty.season} · Week ${week}**${kickoff ? ` for <t:${Math.floor(new Date(kickoff).getTime() / 1000)}:F>` : ''}.`, ephemeral: true });
        }

        if (subcommand === 'result') {
            if (dynasty.seasonClosed) return interaction.reply({ content: '❌ This season is closed. Reopen it through your league administrator before correcting historical results.', ephemeral: true });
            const week = interaction.options.getInteger('week');
            const home = interaction.options.getString('home').trim();
            const away = interaction.options.getString('away').trim();
            const homeScore = interaction.options.getInteger('home-score');
            const awayScore = interaction.options.getInteger('away-score');
            const resultError = validateLeagueResult({ week, homeTeam: home, awayTeam: away, homeScore, awayScore });
            if (resultError) return interaction.reply({ content: `❌ ${resultError} The result was not saved.`, ephemeral: true });
            let game = findGame(dynasty, week, home, away);
            if (game && normalizeTeam(game.homeTeam) !== normalizeTeam(home)) {
                return interaction.reply({ content: `❌ This matchup is scheduled with **${game.homeTeam}** as the home team. Use the scheduled home/away order when recording the result.`, ephemeral: true });
            }
            if (!game) {
                const scheduleError = validateScheduledGame(dynasty, { week, homeTeam: home, awayTeam: away });
                if (scheduleError) return interaction.reply({ content: `❌ ${scheduleError} The result was not saved.`, ephemeral: true });
                const knownTeams = orderedLeagueTeams(dynasty);
                if (!knownTeams.some(team => normalizeTeam(team) === normalizeTeam(home)) || !knownTeams.some(team => normalizeTeam(team) === normalizeTeam(away))) {
                    return interaction.reply({ content: '❌ Both teams must already be registered or appear in this dynasty’s league records. The result was not saved.', ephemeral: true });
                }
                game = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, season: dynasty.season, week, homeTeam: home, awayTeam: away, kickoff: null, createdBy: interaction.user.id, createdAt: new Date().toISOString() };
                dynasty.scheduleGames.push(game);
            }
            const previousResult = getPreviousResult(game) || 'not-final';
            capturePreGameRanks(dynasty, game);
            game.homeScore = homeScore;
            game.awayScore = awayScore;
            game.status = 'final';
            game.recordedBy = interaction.user.id;
            game.recordedAt = new Date().toISOString();
            appendAuditEntry(dynasty, { action: previousResult === 'not-final' ? 'game-result-recorded' : 'game-result-corrected', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, week, home, away, previous: previousResult, correctedTo: `${homeScore}-${awayScore}` } });
            saveDatabase(database);
            if (previousResult !== `${homeScore}-${awayScore}`) {
                const wasCorrection = previousResult !== 'not-final';
                await publishLeagueNotification(interaction.client, database, dynasty, { type: wasCorrection ? 'correction' : 'score', key: `${wasCorrection ? 'correction' : 'score'}:s${dynasty.season}:w${week}:${normalizeTeam(home)}:${normalizeTeam(away)}:${homeScore}-${awayScore}`, title: `${wasCorrection ? '🛠️ Score Correction' : '🏈 Final Score'} · ${dynasty.name}`, description: `Season ${dynasty.season} · Week ${week}\n**${away} ${awayScore} — ${homeScore} ${home}**${wasCorrection ? `\nPrevious score: ${previousResult}` : ''}` });
            }
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            const winner = homeScore === awayScore ? 'Game recorded as a tie' : `**${homeScore > awayScore ? home : away}** wins`;
            return interaction.reply({ content: `✅ **${dynasty.name} · Season ${dynasty.season} · Week ${week}**
${getTeamEmoji(dynasty, away)} **${away} ${awayScore}** at ${getTeamEmoji(dynasty, home)} **${home} ${homeScore}**
${winner}. Standings have been recalculated from all final scores.`, ephemeral: true });
        }

        if (subcommand === 'schedule') {
            const week = interaction.options.getInteger('week');
            let games = currentSeasonGames(dynasty).sort((a, b) => a.week - b.week || (a.kickoff || '').localeCompare(b.kickoff || ''));
            if (week !== null) games = games.filter(game => game.week === week);
            const embed = new EmbedBuilder().setColor(0x243447).setTitle(`📅 ${dynasty.name} · Season ${dynasty.season} Schedule`)
                .setDescription(games.length ? games.slice(0, 25).map(game => formatGame(dynasty, game)).join('\n') : 'No games are scheduled or recorded for this selection yet.')
                .setFooter({ text: games.length > 25 ? `Showing 25 of ${games.length} games` : `${games.length} game(s) · Scheduled games and final scores` });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'standings') {
            const rows = standingsFor(dynasty);
            const lines = rows.map((r, i) => `${String(i + 1).padStart(2, '0')}. ${getTeamEmoji(dynasty, r.team)} **${r.team}** — ${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''} · PF ${r.pointsFor} · PA ${r.pointsAgainst} · ${r.games} GP`);
            const confRows = calculateConferenceStandings(dynasty);
            const confLines = []; let currentConf = null;
            for (const r of confRows) { if (r.conference !== currentConf) { currentConf = r.conference; confLines.push(`**${currentConf}**`); } confLines.push(`• ${r.team} — ${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''} (${r.games} conf. games)`); }
            const embed = new EmbedBuilder().setColor(0x243447).setTitle(`🏆 ${dynasty.name} · Season ${dynasty.season} Standings`)
                .setDescription(lines.length ? lines.slice(0, 25).join('\n') : 'No teams or completed results are available yet. Add games and record final scores to populate standings.')
                .setFooter({ text: 'Verified scores · Overall standings use win percentage, head-to-head, point differential, points scored' });
            if (confLines.length) embed.addFields({ name: 'Conference Standings', value: confLines.join('\n').slice(0, 1024), inline: false });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'rankings') {
            const teams = splitList(interaction.options.getString('teams')).slice(0, 25);
            if (!teams.length) return interaction.reply({ content: '❌ Provide at least one team name.', ephemeral: true });
            dynasty.rankings = teams.slice(0, 4);
            dynasty.seasonRankings.push({ season: dynasty.season, updatedAt: new Date().toISOString(), updatedBy: interaction.user.id, teams });
            appendAuditEntry(dynasty, { action: 'rankings-updated', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, teamCount: teams.length, topFour: teams.slice(0, 4).join(', ') } });
            saveDatabase(database);
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            return interaction.reply({ content: `✅ Updated **${dynasty.name}** rankings for Season ${dynasty.season}:\n${teams.map((team, i) => `${i + 1}. ${team}`).join('\n')}${teams.length > 4 ? `\n\n${teams.length - 4} additional team(s) saved in league ranking history.` : ''}`, ephemeral: true });
        }

        if (subcommand === 'champion') {
            const team = interaction.options.getString('team').trim();
            const runnerUp = interaction.options.getString('runner-up')?.trim() || null;
            const championScore = interaction.options.getInteger('champion-score');
            const runnerUpScore = interaction.options.getInteger('runner-up-score');
            const scoreError = validateChampionScore(team, runnerUp, championScore, runnerUpScore);
            if (scoreError) return interaction.reply({ content: `❌ ${scoreError}`, ephemeral: true });
            if (runnerUp && normalizeTeam(team) === normalizeTeam(runnerUp)) return interaction.reply({ content: '❌ Champion and runner-up must be different teams.', ephemeral: true });
            const history = dynasty.championshipHistory.find(item => Number(item.season) === Number(dynasty.season));
            const record = { season: dynasty.season, year: dynasty.seasonYear, champion: team, runnerUp, championScore, runnerUpScore, recordedBy: interaction.user.id, recordedAt: new Date().toISOString() };
            if (history) Object.assign(history, record); else dynasty.championshipHistory.push(record);
            dynasty.defendingChampion = team;
            appendAuditEntry(dynasty, { action: 'champion-recorded', actorId: interaction.user.id, actorTag: interaction.user.tag, details: { season: dynasty.season, champion: team, runnerUp: runnerUp || '', score: championScore !== null ? `${championScore}-${runnerUpScore}` : 'not-provided', replacedExisting: !!history } });
            saveDatabase(database);
            await updateAllDashboards(interaction.client);
            await refreshCompetitionPanel(interaction.client, dynasty);
            return interaction.reply({ content: `🏆 **${dynasty.name} · Season ${dynasty.season} Champion Recorded**\nChampion: **${team}**${runnerUp ? `\nRunner-up: **${runnerUp}**` : ''}${championScore !== null ? `\nFinal: **${team} ${championScore} – ${runnerUp} ${runnerUpScore}**` : ''}\nThe League Hub dashboard has been refreshed.`, ephemeral: true });
        }
    }
};
