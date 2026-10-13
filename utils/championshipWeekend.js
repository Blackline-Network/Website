'use strict';

function norm(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function isFinal(game) {
  return game?.status === 'final' && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && norm(game.homeTeam) && norm(game.awayTeam) && norm(game.homeTeam) !== norm(game.awayTeam);
}
function isConferenceTitleGame(game) {
  const labels = [game?.type, game?.gameType, game?.round, game?.stage, game?.label, game?.title, game?.eventType]
    .map(norm).filter(Boolean);
  return game?.isConferenceChampionship === true || game?.conferenceChampionship === true ||
    labels.some(label => /conference championship|conference title game/.test(label));
}
function buildChampionshipWeekend(dynasty, { season = dynasty?.season } = {}) {
  const targetSeason = Number(season);
  const allGames = Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [];
  const seasonGames = allGames.filter(game => Number(game?.season) === targetSeason);
  const championshipGames = seasonGames.filter(isConferenceTitleGame).map(game => {
    const final = isFinal(game);
    const winner = final ? (game.homeScore > game.awayScore ? game.homeTeam : game.awayScore > game.homeScore ? game.awayTeam : null) : null;
    return { week: Number.isFinite(Number(game.week)) ? Number(game.week) : null,
      conference: String(game.conference || game.conferenceName || '').trim() || null,
      homeTeam: String(game.homeTeam || '').trim(), awayTeam: String(game.awayTeam || '').trim(),
      homeScore: final ? game.homeScore : null, awayScore: final ? game.awayScore : null,
      status: final ? (winner ? 'final' : 'tie') : (game?.status === 'final' ? 'invalid result' : String(game.status || 'scheduled')), winner,
      loser: final && winner ? (norm(winner) === norm(game.homeTeam) ? game.awayTeam : game.homeTeam) : null };
  }).sort((a,b) => (a.week ?? 999) - (b.week ?? 999) || String(a.conference || '').localeCompare(String(b.conference || '')));
  const recordedTitles = (Array.isArray(dynasty?.conferenceChampionsHistory) ? dynasty.conferenceChampionsHistory : [])
    .filter(row => Number(row?.season) === targetSeason && String(row?.champion || row?.team || '').trim())
    .map(row => ({ conference: String(row.conference || row.detail || '').trim() || 'Conference not recorded',
      champion: String(row.champion || row.team).trim(), runnerUp: String(row.runnerUp || '').trim() || null,
      score: row.championScore != null && row.runnerUpScore != null ? `${row.championScore}–${row.runnerUpScore}` : null }));
  return { season: targetSeason, seasonYear: dynasty?.seasonYear ?? null, championshipGames, recordedTitles,
    finalizedChampionshipGames: championshipGames.filter(game => game.status === 'final').length,
    scheduledChampionshipGames: championshipGames.filter(game => game.status !== 'final' && game.status !== 'tie').length,
    note: 'Only explicitly tagged championship fixtures and explicitly recorded conference champions are shown. Regular-season standings are not treated as title results; missing matchups and champions are not inferred.' };
}
module.exports = { buildChampionshipWeekend, isConferenceTitleGame, isFinal };
