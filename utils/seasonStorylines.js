'use strict';
const { calculatePowerRankings } = require('./powerRankings');
const { normalizeTeam } = require('./rivalryTracker');

function validFinal(game, season) {
  return Number(game?.season) === Number(season) && game?.status === 'final' &&
    Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) &&
    normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam) && Number(game.week) > 0;
}
function snapshot(dynasty, season, throughWeek) {
  const scoped = { ...dynasty, season, scheduleGames: (dynasty.scheduleGames || []).filter(g => Number(g.season) === Number(season) && Number(g.week) <= throughWeek && validFinal(g, season)) };
  return calculatePowerRankings(scoped);
}
function buildSeasonStorylines(dynasty, { season = dynasty?.season, limit = 5 } = {}) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(g => validFinal(g, season)).sort((a,b) => Number(a.week)-Number(b.week) || String(a.id || '').localeCompare(String(b.id || '')));
  const teams = new Map();
  const ensure = name => { const key = normalizeTeam(name); if (!teams.has(key)) teams.set(key, { team: name, form: [] }); return teams.get(key); };
  for (const pick of dynasty?.teamSelections || []) if (pick?.team) ensure(pick.team);
  for (const game of games) {
    const home = ensure(game.homeTeam), away = ensure(game.awayTeam);
    const outcome = game.homeScore === game.awayScore ? 'T' : game.homeScore > game.awayScore ? 'W' : 'L';
    home.form.push({ week: Number(game.week), outcome });
    away.form.push({ week: Number(game.week), outcome: outcome === 'W' ? 'L' : outcome === 'L' ? 'W' : 'T' });
  }
  const streaks = [];
  for (const row of teams.values()) {
    row.form.sort((a,b) => a.week-b.week);
    const last = row.form[row.form.length - 1];
    if (!last || !['W','L'].includes(last.outcome)) continue;
    let count = 0;
    for (let i = row.form.length - 1; i >= 0 && row.form[i].outcome === last.outcome; i--) count++;
    if (count >= 2) streaks.push({ team: row.team, type: last.outcome === 'W' ? 'win' : 'loss', count, throughWeek: last.week });
  }
  streaks.sort((a,b) => b.count-a.count || a.team.localeCompare(b.team));
  const weeks = [...new Set(games.map(g => Number(g.week)))].sort((a,b) => a-b);
  const rankByWeek = new Map(weeks.map(week => [week, snapshot(dynasty, season, week)]));
  const rankClimbs = [];
  for (let i = 1; i < weeks.length; i++) {
    const previous = new Map(rankByWeek.get(weeks[i-1]).map((r,index) => [normalizeTeam(r.team), index+1]));
    const current = rankByWeek.get(weeks[i]);
    for (let index = 0; index < current.length; index++) {
      const row = current[index], before = previous.get(normalizeTeam(row.team));
      const rank = index+1;
      if (before && before-rank >= 2) rankClimbs.push({ team: row.team, fromRank: before, toRank: rank, places: before-rank, throughWeek: weeks[i] });
    }
  }
  rankClimbs.sort((a,b) => b.places-a.places || a.throughWeek-b.throughWeek || a.team.localeCompare(b.team));
  const bestPerformances = games.map(g => {
    const winner = g.homeScore === g.awayScore ? 'Tie' : g.homeScore > g.awayScore ? g.homeTeam : g.awayTeam;
    return { week: Number(g.week), homeTeam: g.homeTeam, awayTeam: g.awayTeam, homeScore: g.homeScore, awayScore: g.awayScore,
      winner, margin: Math.abs(g.homeScore-g.awayScore), totalPoints: g.homeScore+g.awayScore,
      type: g.homeScore === g.awayScore ? 'tie' : 'win' };
  }).sort((a,b) => b.margin-a.margin || b.totalPoints-a.totalPoints || a.week-b.week).slice(0, Math.max(1, Math.min(10, Number(limit)||5)));
  return { season: Number(season), gamesPlayed: games.length, weeksPlayed: weeks, streaks: streaks.slice(0, Math.max(1, Math.min(10, Number(limit)||5))), rankClimbs: rankClimbs.slice(0, Math.max(1, Math.min(10, Number(limit)||5))), bestPerformances };
}
module.exports = { buildSeasonStorylines };
