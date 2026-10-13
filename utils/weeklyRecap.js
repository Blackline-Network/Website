'use strict';
const { buildUpsetTracker } = require('./upsetTracker');
const { calculatePowerRankings } = require('./powerRankings');
const { buildRivalryTracker, normalizeTeam } = require('./rivalryTracker');

function isFinal(game, season) {
  return Number(game?.season) === Number(season) && game?.status === 'final' &&
    typeof game.homeScore === 'number' && Number.isFinite(game.homeScore) && game.homeScore >= 0 &&
    typeof game.awayScore === 'number' && Number.isFinite(game.awayScore) && game.awayScore >= 0 &&
    normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) && normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam);
}
function seasonSlice(dynasty, throughWeek) {
  return { ...dynasty, scheduleGames: (dynasty.scheduleGames || []).filter(game => Number(game.season) === Number(dynasty.season) && Number(game.week || 0) <= throughWeek) };
}
function rankingMap(dynasty, throughWeek) {
  return new Map(calculatePowerRankings(seasonSlice(dynasty, throughWeek)).map((row, index) => [normalizeTeam(row.team), { team: row.team, rank: index + 1, score: row.powerScore }]));
}
function buildWeeklyRecap(dynasty, { season = dynasty?.season, week, limit = 10 } = {}) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).filter(game => isFinal(game, season));
  const availableWeeks = games.map(game => Number(game.week || 0)).filter(value => Number.isInteger(value) && value > 0);
  const targetWeek = Number.isInteger(Number(week)) && Number(week) > 0 ? Number(week) : Math.max(0, ...availableWeeks);
  const weekGames = games.filter(game => Number(game.week || 0) === targetWeek).sort((a, b) => String(a.homeTeam).localeCompare(String(b.homeTeam)));
  const scoped = { ...dynasty, season, scheduleGames: (dynasty.scheduleGames || []).filter(game => Number(game.season) === Number(season)) };
  const upsets = buildUpsetTracker(scoped, { season, limit: 25 }).filter(item => item.week === targetWeek);
  const rivalries = buildRivalryTracker(scoped).flatMap(rivalry => rivalry.results
    .filter(result => Number(result.season) === Number(season) && Number(result.week || 0) === targetWeek)
    .map(result => ({ teamA: rivalry.teamA, teamB: rivalry.teamB, winner: result.winner, scoreA: result.scoreA, scoreB: result.scoreB })));
  const priorRanks = targetWeek > 1 ? rankingMap(dynasty, targetWeek - 1) : new Map();
  const currentRanks = rankingMap(dynasty, targetWeek);
  const rankingMovement = [...currentRanks.values()].map(row => {
    const before = priorRanks.get(normalizeTeam(row.team));
    return before ? { team: row.team, previousRank: before.rank, rank: currentRanks.get(normalizeTeam(row.team)).rank, movement: before.rank - row.rank, score: row.score } : null;
  }).filter(row => row && row.movement !== 0).sort((a, b) => Math.abs(b.movement) - Math.abs(a.movement) || a.rank - b.rank).slice(0, Math.max(1, Math.min(10, Number(limit) || 10)));
  const recruitingMilestones = [];
  for (const prospect of dynasty?.recruitingProspects || []) {
    for (const event of Array.isArray(prospect?.statusHistory) ? prospect.statusHistory : []) {
      const status = String(event.toStatus || '').trim().toLowerCase();
      if (!['committed', 'signed'].includes(status) || Number(event.season || prospect.season) !== Number(season) || Number(event.week) !== targetWeek) continue;
      recruitingMilestones.push({ name: String(prospect.name || 'Unknown prospect'), position: String(prospect.position || 'N/A'), stars: Math.max(0, Math.min(5, Number(prospect.stars) || 0)), team: String(event.team || prospect.team || 'Unassigned'), status });
    }
  }
  const results = weekGames.map(game => ({ homeTeam: game.homeTeam, awayTeam: game.awayTeam, homeScore: game.homeScore, awayScore: game.awayScore, winner: game.homeScore === game.awayScore ? 'Tie' : game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam, margin: Math.abs(game.homeScore - game.awayScore) }));
  const decisive = results.filter(game => game.winner !== 'Tie').sort((a, b) => b.margin - a.margin);
  return { season: Number(season), week: targetWeek, gamesPlayed: weekGames.length, results, biggestWin: decisive[0] || null, upsets, rivalries, recruitingMilestones, rankingMovement, hasPriorRanking: targetWeek > 1 && priorRanks.size > 0 };
}
module.exports = { buildWeeklyRecap };
