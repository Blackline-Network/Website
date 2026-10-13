'use strict';

function normalizeTeam(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Calculate transparent, current-season power rankings from finalized game results.
 * Score: 60 * win percentage + 0.75 * clamped point differential per game
 * (differential clamped to -20..20) + 0.2 * points scored per game (capped at 50)
 * + 2.5 per win in the team's most recent three finalized games.
 * Ties count as half a win. This is separate from the league's manually maintained rankings.
 */
function calculatePowerRankings(dynasty) {
  const season = Number(dynasty?.season);
  const teams = new Map();
  const ensure = name => {
    const team = String(name || '').trim().replace(/\s+/g, ' ');
    const key = normalizeTeam(team);
    if (!key) return null;
    if (!teams.has(key)) teams.set(key, {
      team, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0,
      recent: [], powerScore: 0, winPercentage: 0, pointDifferential: 0
    });
    return teams.get(key);
  };

  for (const selection of dynasty?.teamSelections || []) ensure(selection?.team);
  for (const name of dynasty?.rankings || []) if (name && name !== 'N/A') ensure(name);

  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(game => Number(game.season) === season && game.status === 'final' &&
      typeof game.homeScore === 'number' && Number.isFinite(game.homeScore) &&
      typeof game.awayScore === 'number' && Number.isFinite(game.awayScore) &&
      game.homeScore >= 0 && game.awayScore >= 0 &&
      normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) &&
      normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam))
    .sort((a, b) => Number(a.week || 0) - Number(b.week || 0) ||
      String(a.completedAt || a.updatedAt || '').localeCompare(String(b.completedAt || b.updatedAt || '')));

  for (const game of games) {
    const home = ensure(game.homeTeam), away = ensure(game.awayTeam);
    home.games++; away.games++;
    home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
    away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
    let homeOutcome = 'tie', awayOutcome = 'tie';
    if (game.homeScore > game.awayScore) { home.wins++; away.losses++; homeOutcome = 'win'; awayOutcome = 'loss'; }
    else if (game.homeScore < game.awayScore) { away.wins++; home.losses++; homeOutcome = 'loss'; awayOutcome = 'win'; }
    else { home.ties++; away.ties++; }
    home.recent.push({ week: Number(game.week || 0), outcome: homeOutcome });
    away.recent.push({ week: Number(game.week || 0), outcome: awayOutcome });
  }

  for (const row of teams.values()) {
    row.winPercentage = row.games ? (row.wins + row.ties * 0.5) / row.games : 0;
    row.pointDifferential = row.pointsFor - row.pointsAgainst;
    const differentialPerGame = row.games ? Math.max(-20, Math.min(20, row.pointDifferential / row.games)) : 0;
    const pointsPerGame = row.games ? Math.min(50, row.pointsFor / row.games) : 0;
    const recentWins = row.recent.slice(-3).filter(game => game.outcome === 'win').length;
    row.powerScore = Number((60 * row.winPercentage + 0.75 * differentialPerGame + 0.2 * pointsPerGame + 2.5 * recentWins).toFixed(2));
    row.recentForm = row.recent.slice(-3).map(game => game.outcome === 'win' ? 'W' : game.outcome === 'loss' ? 'L' : 'T').join('-') || '—';
    delete row.recent;
  }

  return [...teams.values()].sort((a, b) => b.powerScore - a.powerScore ||
    b.winPercentage - a.winPercentage || b.pointDifferential - a.pointDifferential ||
    b.pointsFor - a.pointsFor || a.team.localeCompare(b.team));
}

module.exports = { calculatePowerRankings };
