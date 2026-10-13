'use strict';
const { buildCoachOfWeek } = require('./coachOfWeek');
const { buildWeeklyRecap } = require('./weeklyRecap');

function validFinal(game, season) {
  return Number(game?.season) === Number(season) && Number.isInteger(Number(game?.week)) && Number(game.week) > 0 &&
    game.status === 'final' && typeof game.homeScore === 'number' && Number.isFinite(game.homeScore) && game.homeScore >= 0 &&
    typeof game.awayScore === 'number' && Number.isFinite(game.awayScore) && game.awayScore >= 0 &&
    String(game.homeTeam || '').trim() && String(game.awayTeam || '').trim() &&
    String(game.homeTeam).trim().toLocaleLowerCase() !== String(game.awayTeam).trim().toLocaleLowerCase();
}

function buildWeeklyLeagueAwards(dynasty, { season = dynasty?.season, week } = {}) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).filter(game => validFinal(game, season));
  const availableWeeks = games.map(game => Number(game.week));
  const targetWeek = Number.isInteger(Number(week)) && Number(week) > 0 ? Number(week) : Math.max(0, ...availableWeeks);
  const weekGames = games.filter(game => Number(game.week) === targetWeek).map(game => ({
    homeTeam: String(game.homeTeam).trim(), awayTeam: String(game.awayTeam).trim(),
    homeScore: game.homeScore, awayScore: game.awayScore,
    totalPoints: game.homeScore + game.awayScore, margin: Math.abs(game.homeScore - game.awayScore),
    winner: game.homeScore === game.awayScore ? null : game.homeScore > game.awayScore ? String(game.homeTeam).trim() : String(game.awayTeam).trim(),
    winnerScore: Math.max(game.homeScore, game.awayScore), loserScore: Math.min(game.homeScore, game.awayScore)
  }));
  const sortBy = (a, b) => b.totalPoints - a.totalPoints || b.margin - a.margin || a.homeTeam.localeCompare(b.homeTeam);
  const decisive = weekGames.filter(game => game.winner).sort((a, b) => b.margin - a.margin || b.totalPoints - a.totalPoints || a.homeTeam.localeCompare(b.homeTeam));
  const closest = weekGames.filter(game => game.winner).sort((a, b) => a.margin - b.margin || b.totalPoints - a.totalPoints || a.homeTeam.localeCompare(b.homeTeam));
  const topScoring = [...weekGames].sort(sortBy)[0] || null;
  const highestWinner = weekGames.filter(game => game.winner).sort((a, b) => b.winnerScore - a.winnerScore || b.margin - a.margin || a.homeTeam.localeCompare(b.homeTeam))[0] || null;
  const recap = targetWeek > 0 ? buildWeeklyRecap(dynasty, { season, week: targetWeek }) : null;
  const coachAward = targetWeek > 0 ? buildCoachOfWeek(dynasty, { season, week: targetWeek }) : null;
  const upset = recap?.upsets?.[0] || null;
  return {
    season: Number(season), week: targetWeek, gamesPlayed: weekGames.length,
    awards: {
      highestScoringGame: topScoring,
      biggestWin: decisive[0] || null,
      closestWin: closest[0] || null,
      topScoringWinner: highestWinner,
      upsetOfTheWeek: upset,
      coachOfTheWeek: coachAward?.winner || null
    },
    note: 'Weekly honors are calculated from finalized game results, recorded pregame rankings, and registered coach/team assignments. No player statistics or unrecorded performances are inferred.'
  };
}
module.exports = { buildWeeklyLeagueAwards };
