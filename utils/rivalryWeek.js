'use strict';
const { buildRivalryTracker, normalizeTeam } = require('./rivalryTracker');

/** Build a current-season rivalry-week view using only known historical pairs and recorded games. */
function buildRivalryWeek(dynasty, season = dynasty?.season) {
  const rivalryRows = buildRivalryTracker(dynasty);
  const pairMap = new Map(rivalryRows.map(row => [row.key, row]));
  const games = Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [];
  const upcoming = [];
  for (const game of games) {
    if (!game || game.status !== 'scheduled') continue;
    const gameSeason = Number(game.season);
    if (Number.isFinite(Number(season)) && Number.isFinite(gameSeason) && gameSeason !== Number(season)) continue;
    const homeTeam = String(game.homeTeam || '').trim();
    const awayTeam = String(game.awayTeam || '').trim();
    const homeKey = normalizeTeam(homeTeam), awayKey = normalizeTeam(awayTeam);
    if (!homeKey || !awayKey || homeKey === awayKey) continue;
    const [firstKey, secondKey] = [homeKey, awayKey].sort();
    const rivalry = pairMap.get(`${firstKey}::${secondKey}`);
    if (!rivalry) continue;
    upcoming.push({
      season: Number.isFinite(gameSeason) ? gameSeason : null,
      week: Number.isFinite(Number(game.week)) ? Number(game.week) : null,
      homeTeam, awayTeam, rivalryKey: rivalry.key,
      teamA: rivalry.teamA, teamB: rivalry.teamB,
      teamAWins: rivalry.teamAWins, teamBWins: rivalry.teamBWins, ties: rivalry.ties,
      priorGames: rivalry.games,
      latest: rivalry.latest,
      recentResults: rivalry.recentResults,
      streak: rivalry.streak
    });
  }
  upcoming.sort((a, b) => (a.week ?? Number.MAX_SAFE_INTEGER) - (b.week ?? Number.MAX_SAFE_INTEGER)
    || a.homeTeam.localeCompare(b.homeTeam) || a.awayTeam.localeCompare(b.awayTeam));
  const tracked = rivalryRows.filter(row => row.games > 0).length;
  return { season: Number.isFinite(Number(season)) ? Number(season) : null, trackedRivalries: tracked, upcoming, rivalryRows };
}
module.exports = { buildRivalryWeek };
