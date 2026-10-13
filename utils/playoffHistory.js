'use strict';

function normalizeTeam(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function validScore(game) {
  return game?.status === 'final' && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && game.homeScore !== game.awayScore;
}
function pairKey(a, b) {
  return [normalizeTeam(a), normalizeTeam(b)].sort().join('::');
}
function getBracketRows(dynasty) {
  const bySeason = new Map();
  for (const archive of Array.isArray(dynasty?.seasonArchives) ? dynasty.seasonArchives : []) {
    const season = Number(archive?.season);
    if (!Number.isFinite(season) || !archive?.playoffBracket || Number(archive.playoffBracket.season ?? season) !== season) continue;
    bySeason.set(season, { season, bracket: archive.playoffBracket, archived: true, champion: archive.champion || archive.playoffBracket.champion || null });
  }
  const current = dynasty?.playoffBracket;
  if (current && Number.isFinite(Number(current.season))) {
    bySeason.set(Number(current.season), { season: Number(current.season), bracket: current, archived: false, champion: current.champion || null });
  }
  return [...bySeason.values()].sort((a, b) => b.season - a.season);
}
function buildPlayoffHistory(dynasty, { maxSeasons = 12, maxMatchups = 16 } = {}) {
  const rows = getBracketRows(dynasty).slice(0, Math.max(1, Math.min(30, maxSeasons)));
  const matchups = [];
  const pairSeasons = new Map();
  const seasonSummaries = [];
  for (const row of rows) {
    const bracket = row.bracket;
    let seasonGames = 0;
    const rounds = Array.isArray(bracket.rounds) ? bracket.rounds : [];
    for (const round of rounds) {
      for (const game of Array.isArray(round?.games) ? round.games : []) {
        const homeTeam = String(game?.homeTeam ?? '').trim();
        const awayTeam = String(game?.awayTeam ?? '').trim();
        if (!homeTeam || !awayTeam || normalizeTeam(homeTeam) === normalizeTeam(awayTeam)) continue;
        const key = pairKey(homeTeam, awayTeam);
        if (!pairSeasons.has(key)) pairSeasons.set(key, { teams: [homeTeam, awayTeam], seasons: [] });
        const pair = pairSeasons.get(key);
        if (!pair.seasons.includes(row.season)) pair.seasons.push(row.season);
        const final = validScore(game);
        if (final) seasonGames++;
        matchups.push({ season: row.season, round: String(round.name || `Round ${round.round ?? '?'}`), homeTeam, awayTeam,
          homeScore: final ? game.homeScore : null, awayScore: final ? game.awayScore : null,
          winner: final ? (game.homeScore > game.awayScore ? homeTeam : awayTeam) : null,
          status: final ? 'final' : (game.status === 'final' ? 'invalid result' : (game.status || 'scheduled')), archived: row.archived });
      }
    }
    seasonSummaries.push({ season: row.season, champion: row.champion, status: bracket.status || (row.champion ? 'complete' : 'in progress'),
      finalizedGames: seasonGames, roundCount: rounds.length, archived: row.archived });
  }
  const currentSeason = Number(dynasty?.season);
  const currentMatchups = matchups.filter(item => item.season === currentSeason);
  const pastPairs = new Map();
  for (const [key, pair] of pairSeasons) {
    const previousSeasons = pair.seasons.filter(season => season < currentSeason).sort((a, b) => b - a);
    if (previousSeasons.length) pastPairs.set(key, { ...pair, previousSeasons });
  }
  const rematches = currentMatchups.map(item => {
    const history = pastPairs.get(pairKey(item.homeTeam, item.awayTeam));
    return history ? { ...item, previousSeasons: history.previousSeasons } : null;
  }).filter(Boolean).sort((a, b) => (b.previousSeasons.length - a.previousSeasons.length) || a.round.localeCompare(b.round));
  const repeatSeries = [...pairSeasons.values()].filter(pair => pair.seasons.length >= 2)
    .map(pair => ({ teams: pair.teams, seasons: [...pair.seasons].sort((a, b) => b - a), meetings: pair.seasons.length }))
    .sort((a, b) => b.meetings - a.meetings || a.teams[0].localeCompare(b.teams[0]));
  const recentResults = matchups.filter(item => item.status === 'final').sort((a, b) => b.season - a.season).slice(0, maxMatchups);
  return {
    currentSeason, seasons: seasonSummaries, matchups: recentResults, rematches,
    repeatSeries: repeatSeries.slice(0, maxMatchups), bracketsAvailable: rows.length,
    totalMatchups: matchups.length,
    note: rows.length ? 'Built from the saved current bracket and archived season brackets. Missing historical brackets cannot be reconstructed from championship records alone.' : 'No saved playoff bracket or archived playoff bracket is available yet. Historical championship records alone do not contain enough detail to reconstruct rounds and matchups.'
  };
}
module.exports = { buildPlayoffHistory, getBracketRows, normalizeTeam, pairKey };
