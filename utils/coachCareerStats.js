'use strict';

function normalizeTeam(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function buildCoachCareerBySeason(dynasty, userId) {
  const entries = Array.isArray(dynasty?.coachCareers?.[userId]) ? dynasty.coachCareers[userId] : [];
  const selection = (dynasty?.teamSelections || []).find(item => String(item?.userId) === String(userId));
  const normalizedEntries = entries.map(entry => ({
    team: normalizeTeam(entry?.team),
    start: Number(entry?.startSeason),
    end: Number(entry?.endSeason ?? entry?.startSeason)
  })).filter(entry => entry.team && Number.isInteger(entry.start) && Number.isInteger(entry.end) && entry.start > 0 && entry.end >= entry.start);

  // If the current program has no recorded tenure at all, only attribute its
  // current-season results to the coach; do not claim unverified prior seasons.
  const currentTeam = normalizeTeam(selection?.team);
  const hasCurrentTeamTenure = currentTeam && normalizedEntries.some(entry => entry.team === currentTeam);
  const seasons = new Map();
  const seenGames = new Set();
  for (const [index, game] of (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).entries()) {
    if (game?.status !== 'final' || typeof game.homeScore !== 'number' || !Number.isFinite(game.homeScore) || game.homeScore < 0 ||
        typeof game.awayScore !== 'number' || !Number.isFinite(game.awayScore) || game.awayScore < 0) continue;
    const season = Number(game.season);
    if (!Number.isInteger(season) || season < 1) continue;
    const homeTeam = normalizeTeam(game.homeTeam);
    const awayTeam = normalizeTeam(game.awayTeam);
    if (!homeTeam || !awayTeam || homeTeam === awayTeam) continue;
    let coachedTeam = null;
    if (normalizedEntries.some(entry => entry.team === homeTeam && season >= entry.start && season <= entry.end)) coachedTeam = homeTeam;
    if (normalizedEntries.some(entry => entry.team === awayTeam && season >= entry.start && season <= entry.end)) {
      if (coachedTeam && coachedTeam !== awayTeam) continue; // ambiguous overlapping team tenures; avoid double attribution
      coachedTeam = awayTeam;
    }
    if (!coachedTeam && !hasCurrentTeamTenure && currentTeam && season === Number(dynasty?.season) && (homeTeam === currentTeam || awayTeam === currentTeam)) coachedTeam = currentTeam;
    if (!coachedTeam) continue;
    const gameKey = `${season}|${index}|${coachedTeam}`;
    if (seenGames.has(gameKey)) continue;
    seenGames.add(gameKey);
    const own = coachedTeam === homeTeam ? game.homeScore : game.awayScore;
    const opponent = coachedTeam === homeTeam ? game.awayScore : game.homeScore;
    if (!seasons.has(season)) seasons.set(season, { season, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 });
    const row = seasons.get(season);
    row.games++;
    row.pointsFor += own;
    row.pointsAgainst += opponent;
    if (own > opponent) row.wins++;
    else if (own < opponent) row.losses++;
    else row.ties++;
  }

  const rows = [...seasons.values()].map(row => ({
    ...row,
    pointDifferential: row.pointsFor - row.pointsAgainst,
    winPercentage: row.games ? (row.wins + row.ties * 0.5) / row.games : 0
  })).sort((a, b) => b.season - a.season);
  const bestSeason = [...rows].sort((a, b) => b.winPercentage - a.winPercentage || b.wins - a.wins || b.pointDifferential - a.pointDifferential || b.season - a.season)[0] || null;
  return { seasons: rows, bestSeason, gamesCounted: rows.reduce((sum, row) => sum + row.games, 0) };
}

module.exports = { buildCoachCareerBySeason, normalizeTeam };
