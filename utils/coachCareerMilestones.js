'use strict';

function normalizeTeam(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function recordedCoachGames(dynasty, userId) {
  const entries = Array.isArray(dynasty?.coachCareers?.[userId]) ? dynasty.coachCareers[userId] : [];
  const tenures = entries.map(entry => ({
    team: normalizeTeam(entry?.team),
    start: Number(entry?.startSeason),
    end: Number(entry?.endSeason ?? entry?.startSeason)
  })).filter(entry => entry.team && Number.isInteger(entry.start) && Number.isInteger(entry.end) && entry.start > 0 && entry.end >= entry.start);
  const selection = (Array.isArray(dynasty?.teamSelections) ? dynasty.teamSelections : [])
    .find(item => String(item?.userId) === String(userId));
  const currentTeam = normalizeTeam(selection?.team);
  const hasCurrentTeamTenure = currentTeam && tenures.some(entry => entry.team === currentTeam);
  const games = [];
  for (const [index, game] of (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).entries()) {
    if (game?.status !== 'final' || typeof game.homeScore !== 'number' || !Number.isFinite(game.homeScore) || game.homeScore < 0 ||
        typeof game.awayScore !== 'number' || !Number.isFinite(game.awayScore) || game.awayScore < 0) continue;
    const season = Number(game.season);
    if (!Number.isInteger(season) || season < 1) continue;
    const home = normalizeTeam(game.homeTeam), away = normalizeTeam(game.awayTeam);
    if (!home || !away || home === away) continue;
    const coached = new Set();
    if (tenures.some(entry => entry.team === home && season >= entry.start && season <= entry.end)) coached.add(home);
    if (tenures.some(entry => entry.team === away && season >= entry.start && season <= entry.end)) coached.add(away);
    if (!coached.size && !hasCurrentTeamTenure && currentTeam && season === Number(dynasty?.season) && (home === currentTeam || away === currentTeam)) coached.add(currentTeam);
    // If overlapping career records would attribute both teams to the same coach, skip the game.
    if (coached.size !== 1) continue;
    const team = [...coached][0];
    const own = team === home ? game.homeScore : game.awayScore;
    const opponent = team === home ? game.awayScore : game.homeScore;
    const week = Number(game.week);
    games.push({ season, week: Number.isFinite(week) ? week : Number.MAX_SAFE_INTEGER, index,
      result: own > opponent ? 'W' : own < opponent ? 'L' : 'T', own, opponent, team });
  }
  return games.sort((a, b) => a.season - b.season || a.week - b.week || a.index - b.index);
}

function buildCoachCareerMilestones(dynasty, userId, seasonStats = {}) {
  const games = recordedCoachGames(dynasty, userId);
  let currentWinStreak = 0;
  let longestWinStreak = 0;
  for (const game of games) {
    if (game.result === 'W') {
      currentWinStreak++;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else {
      currentWinStreak = 0;
    }
  }
  const seasons = Array.isArray(seasonStats.seasons) ? seasonStats.seasons : [];
  const winningSeasons = seasons.filter(row => Number(row.wins) > Number(row.losses)).length;
  const undefeatedSeasons = seasons.filter(row => Number(row.games) >= 8 && Number(row.losses) === 0).length;
  const tenWinSeasons = seasons.filter(row => Number(row.wins) >= 10).length;
  const milestones = [];
  if (longestWinStreak >= 5) milestones.push(`🔥 ${longestWinStreak}-game career win streak`);
  if (currentWinStreak >= 3) milestones.push(`📈 Active ${currentWinStreak}-game win streak`);
  if (winningSeasons >= 3) milestones.push(`✅ ${winningSeasons} winning seasons`);
  if (winningSeasons >= 5) milestones.push('🏅 Sustained success: 5+ winning seasons');
  if (tenWinSeasons >= 1) milestones.push(`🏆 ${tenWinSeasons} season(s) with 10+ wins`);
  if (undefeatedSeasons >= 1) milestones.push(`💎 ${undefeatedSeasons} unbeaten season(s) with at least 8 games`);
  return { milestones, gamesCounted: games.length, currentWinStreak, longestWinStreak, winningSeasons, tenWinSeasons, undefeatedSeasons };
}

module.exports = { buildCoachCareerMilestones, recordedCoachGames };
