'use strict';
const { calculatePowerRankings } = require('./powerRankings');
const { normalizeTeam } = require('./rivalryTracker');

function validFinal(game, season) {
  return Number(game?.season) === Number(season) && Number.isInteger(Number(game?.week)) && Number(game.week) > 0 &&
    game.status === 'final' && typeof game.homeScore === 'number' && Number.isFinite(game.homeScore) && game.homeScore >= 0 &&
    typeof game.awayScore === 'number' && Number.isFinite(game.awayScore) && game.awayScore >= 0 &&
    normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) && normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam);
}

function buildCoachOfWeek(dynasty, { season = dynasty?.season, week, limit = 5 } = {}) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).filter(game => validFinal(game, season));
  const weeks = games.map(game => Number(game.week));
  const targetWeek = Number.isInteger(Number(week)) && Number(week) > 0 ? Number(week) : Math.max(0, ...weeks);
  const weekGames = games.filter(game => Number(game.week) === targetWeek);
  const teamSelections = new Map();
  for (const selection of dynasty?.teamSelections || []) {
    const key = normalizeTeam(selection?.team);
    if (key && selection?.userId) teamSelections.set(key, selection.userId);
  }
  const coaches = new Map((dynasty?.coaches || []).filter(coach => coach?.userId).map(coach => [String(coach.userId), coach]));
  const priorGames = games.filter(game => Number(game.week) < targetWeek);
  const priorRanks = calculatePowerRankings({ ...dynasty, season: Number(season), scheduleGames: priorGames });
  const rankByTeam = new Map(priorRanks.map((row, index) => [normalizeTeam(row.team), index + 1]));
  const candidates = [];
  for (const game of weekGames) {
    for (const side of ['home', 'away']) {
      const team = game[`${side}Team`];
      const opponent = game[`${side === 'home' ? 'away' : 'home'}Team`];
      const pointsFor = game[`${side}Score`];
      const pointsAgainst = game[`${side === 'home' ? 'away' : 'home'}Score`];
      const userId = teamSelections.get(normalizeTeam(team));
      const coach = userId ? coaches.get(String(userId)) : null;
      if (!coach) continue;
      const outcome = pointsFor > pointsAgainst ? 'win' : pointsFor < pointsAgainst ? 'loss' : 'tie';
      const opponentRank = rankByTeam.get(normalizeTeam(opponent)) || null;
      const strengthBonus = opponentRank ? Math.max(0, Math.min(5, (priorRanks.length - opponentRank + 1) * 0.5)) : 0;
      const margin = Math.abs(pointsFor - pointsAgainst);
      const score = Number(((outcome === 'win' ? 10 : outcome === 'tie' ? 4 : 0) + Math.min(8, margin / 3) + (outcome === 'win' ? strengthBonus : 0)).toFixed(2));
      candidates.push({ coachId: String(userId), coachName: String(coach.username || coach.displayName || 'Registered Coach'), team, opponent,
        week: targetWeek, season: Number(season), pointsFor, pointsAgainst, margin, outcome, opponentRank, strengthBonus, score });
    }
  }
  const eligible = candidates.filter(row => row.outcome === 'win').length ? candidates.filter(row => row.outcome === 'win') : candidates.filter(row => row.outcome === 'tie');
  eligible.sort((a, b) => b.score - a.score || b.margin - a.margin || a.team.localeCompare(b.team));
  return { season: Number(season), week: targetWeek, gamesPlayed: weekGames.length, candidates: candidates.sort((a,b) => b.score-a.score || a.team.localeCompare(b.team)).slice(0, Math.max(1, Math.min(10, Number(limit) || 5))), eligibleCandidates: eligible.slice(0, Math.max(1, Math.min(10, Number(limit) || 5))), winner: eligible[0] || null,
    scoring: 'Wins earn 10 base points; ties earn 4 if no coached win is available. Winning margin adds up to 8 points, and beating a stronger opponent adds up to 5 points based on pregame rankings. Losses are ineligible.' };
}
module.exports = { buildCoachOfWeek };
