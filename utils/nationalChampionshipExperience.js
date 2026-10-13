
'use strict';

function norm(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function isNationalTitleGame(game) {
  const labels = [game?.type, game?.gameType, game?.round, game?.stage, game?.label, game?.title, game?.eventType]
    .map(norm).filter(Boolean);
  return game?.isNationalChampionship === true || game?.nationalChampionship === true ||
    labels.some(label => /national championship|college football playoff championship|cfp championship|national title game/.test(label));
}
function validFinal(game) {
  return game?.status === 'final' && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && norm(game.homeTeam) && norm(game.awayTeam) && norm(game.homeTeam) !== norm(game.awayTeam);
}
function buildNationalChampionshipExperience(dynasty, { season = dynasty?.season } = {}) {
  const targetSeason = Number(season);
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(game => Number(game?.season) === targetSeason && isNationalTitleGame(game))
    .map(game => {
      const final = validFinal(game);
      const tied = final && game.homeScore === game.awayScore;
      const winner = final && !tied ? (game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam) : null;
      return { season: targetSeason, week: Number.isFinite(Number(game.week)) ? Number(game.week) : null,
        homeTeam: String(game.homeTeam || '').trim(), awayTeam: String(game.awayTeam || '').trim(),
        homeScore: final ? game.homeScore : null, awayScore: final ? game.awayScore : null,
        status: !final ? (game.status === 'final' ? 'invalid result' : String(game.status || 'scheduled')) : tied ? 'tie' : 'final',
        champion: winner, runnerUp: winner ? (norm(winner) === norm(game.homeTeam) ? game.awayTeam : game.homeTeam) : null };
    }).sort((a,b) => (a.week ?? 999) - (b.week ?? 999));
  const history = (Array.isArray(dynasty?.championshipHistory) ? dynasty.championshipHistory : [])
    .filter(row => Number(row?.season) === targetSeason && String(row?.champion || '').trim())
    .map(row => ({ season: targetSeason, champion: String(row.champion).trim(),
      runnerUp: String(row.runnerUp || '').trim() || null,
      championScore: Number.isFinite(row.championScore) ? row.championScore : null,
      runnerUpScore: Number.isFinite(row.runnerUpScore) ? row.runnerUpScore : null,
      score: Number.isFinite(row.championScore) && Number.isFinite(row.runnerUpScore) ? `${row.championScore}–${row.runnerUpScore}` : null }));
  const latest = history[history.length - 1] || null;
  const finalizedGames = games.filter(game => game.status === 'final');
  return { season: targetSeason, seasonYear: dynasty?.seasonYear ?? null, games, history, latest,
    finalizedGames, note: 'Only explicitly tagged national championship games and explicitly recorded championship history are shown. Playoff seeds, rankings, or regular-season results are never used to infer a champion.' };
}
module.exports = { buildNationalChampionshipExperience, isNationalTitleGame, validFinal };
