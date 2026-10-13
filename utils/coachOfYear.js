'use strict';
const { calculatePowerRankings } = require('./powerRankings');
const { normalizeTeam } = require('./rivalryTracker');

function validFinal(game, season) {
  return Number(game?.season) === Number(season) && Number.isInteger(Number(game?.week)) && Number(game.week) > 0 &&
    game.status === 'final' && typeof game.homeScore === 'number' && Number.isFinite(game.homeScore) && game.homeScore >= 0 &&
    typeof game.awayScore === 'number' && Number.isFinite(game.awayScore) && game.awayScore >= 0 &&
    normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) && normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam);
}

function buildCoachOfYearRace(dynasty, { season = dynasty?.season, limit = 10 } = {}) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).filter(game => validFinal(game, season));
  const selections = new Map();
  for (const selection of dynasty?.teamSelections || []) {
    const team = normalizeTeam(selection?.team);
    if (team && selection?.userId) selections.set(team, String(selection.userId));
  }
  const coaches = new Map((dynasty?.coaches || []).filter(c => c?.userId).map(c => [String(c.userId), c]));
  const rows = new Map();
  const ensure = (userId, team) => {
    if (!rows.has(userId)) {
      const coach = coaches.get(userId) || {};
      rows.set(userId, { coachId: userId, coachName: String(coach.username || coach.displayName || 'Registered Coach'), team,
        games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, score: 0, strongerOpponentWins: 0, winningWeeks: new Set(), weeks: new Set() });
    }
    return rows.get(userId);
  };
  for (const game of games) {
    const week = Number(game.week);
    const priorGames = games.filter(g => Number(g.week) < week);
    const priorRanks = calculatePowerRankings({ ...dynasty, season: Number(season), scheduleGames: priorGames });
    const rankByTeam = new Map(priorRanks.map((row, i) => [normalizeTeam(row.team), i + 1]));
    for (const side of ['home', 'away']) {
      const team = game[`${side}Team`];
      const userId = selections.get(normalizeTeam(team));
      if (!userId || !coaches.has(userId)) continue;
      const opponent = game[`${side === 'home' ? 'away' : 'home'}Team`];
      const pf = game[`${side}Score`];
      const pa = game[`${side === 'home' ? 'away' : 'home'}Score`];
      const outcome = pf > pa ? 'win' : pf < pa ? 'loss' : 'tie';
      const opponentRank = rankByTeam.get(normalizeTeam(opponent)) || null;
      const strengthBonus = outcome === 'win' && opponentRank ? Math.max(0, Math.min(5, (priorRanks.length - opponentRank + 1) * 0.5)) : 0;
      const gameScore = (outcome === 'win' ? 10 : outcome === 'tie' ? 4 : 0) + Math.min(8, Math.abs(pf - pa) / 3) + strengthBonus;
      const row = ensure(userId, team);
      row.games++; row.pointsFor += pf; row.pointsAgainst += pa; row.score += gameScore; row.weeks.add(week);
      if (outcome === 'win') { row.wins++; row.winningWeeks.add(week); if (opponentRank) row.strongerOpponentWins += 1; }
      else if (outcome === 'loss') row.losses++;
      else row.ties++;
    }
  }
  const leaderboard = [...rows.values()].map(row => {
    const gamesPlayed = row.games;
    return { coachId: row.coachId, coachName: row.coachName, team: row.team, games: gamesPlayed, wins: row.wins, losses: row.losses, ties: row.ties,
      winPercentage: gamesPlayed ? (row.wins + row.ties * 0.5) / gamesPlayed : 0,
      pointsFor: row.pointsFor, pointsAgainst: row.pointsAgainst, pointDifferential: row.pointsFor - row.pointsAgainst,
      racePoints: Number(row.score.toFixed(2)), strongerOpponentWins: row.strongerOpponentWins,
      winningWeeks: row.winningWeeks.size, weeksCoached: row.weeks.size,
      consistency: row.weeks.size ? Number((row.winningWeeks.size / row.weeks.size).toFixed(3)) : 0 };
  }).sort((a, b) => b.racePoints - a.racePoints || b.winPercentage - a.winPercentage || b.pointDifferential - a.pointDifferential || a.coachName.localeCompare(b.coachName));
  return { season: Number(season), gamesCounted: games.length, leaderboard: leaderboard.slice(0, Math.max(1, Math.min(25, Number(limit) || 10))),
    scoring: 'Each finalized coached win earns 10 base points; ties earn 4 and losses 0. Point margin adds up to 8 points per game. Wins over higher-ranked pregame opponents earn up to 5 additional points. Ties are broken by win percentage, then point differential.' };
}
module.exports = { buildCoachOfYearRace };
