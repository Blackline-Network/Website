'use strict';

const { normalizeTeam } = require('./rivalryTracker');

function coachLabel(dynasty, userId) {
  const selection = (Array.isArray(dynasty?.teamSelections) ? dynasty.teamSelections : [])
    .find(row => String(row?.userId) === String(userId));
  return String(selection?.username || selection?.displayName || `Coach ${String(userId).slice(-6)}`);
}

/**
 * Compare registered coaches only when both sides of a finalized game can be
 * attributed unambiguously to recorded coaching tenures. Current assignments
 * are used only for the current season when no tenure is recorded for that
 * coach/team/season.
 */
function buildCoachRivalries(dynasty) {
  const careers = dynasty?.coachCareers && typeof dynasty.coachCareers === 'object' ? dynasty.coachCareers : {};
  const selections = Array.isArray(dynasty?.teamSelections) ? dynasty.teamSelections : [];
  const tenures = [];
  for (const [coachId, entries] of Object.entries(careers)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const team = normalizeTeam(entry?.team);
      const start = Number(entry?.startSeason);
      const end = Number(entry?.endSeason ?? entry?.startSeason);
      if (team && Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
        tenures.push({ coachId: String(coachId), team, start, end });
      }
    }
  }
  const currentSeason = Number(dynasty?.season);
  const coachFor = (team, season) => {
    const recorded = new Set(tenures.filter(t => t.team === team && season >= t.start && season <= t.end).map(t => t.coachId));
    if (recorded.size === 1) return [...recorded][0];
    if (recorded.size > 1) return null;
    if (season === currentSeason) {
      const assigned = new Set(selections.filter(s => normalizeTeam(s?.team) === team && s?.userId).map(s => String(s.userId)));
      if (assigned.size === 1) return [...assigned][0];
    }
    return null;
  };

  const records = new Map();
  const games = Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [];
  for (const [index, game] of games.entries()) {
    if (game?.status !== 'final' || !Number.isFinite(game.homeScore) || game.homeScore < 0 || !Number.isFinite(game.awayScore) || game.awayScore < 0) continue;
    const season = Number(game.season);
    if (!Number.isInteger(season) || season < 1) continue;
    const home = normalizeTeam(game.homeTeam), away = normalizeTeam(game.awayTeam);
    if (!home || !away || home === away) continue;
    const homeCoach = coachFor(home, season), awayCoach = coachFor(away, season);
    if (!homeCoach || !awayCoach || homeCoach === awayCoach) continue;
    const [coachA, coachB] = [homeCoach, awayCoach].sort((a, b) => a.localeCompare(b));
    const key = `${coachA}::${coachB}`;
    if (!records.has(key)) records.set(key, { key, coachA, coachB, coachAName: coachLabel(dynasty, coachA), coachBName: coachLabel(dynasty, coachB), games: 0, coachAWins: 0, coachBWins: 0, ties: 0, results: [] });
    const row = records.get(key);
    const aIsHome = homeCoach === coachA;
    const scoreA = aIsHome ? game.homeScore : game.awayScore;
    const scoreB = aIsHome ? game.awayScore : game.homeScore;
    row.games++;
    if (scoreA > scoreB) row.coachAWins++;
    else if (scoreB > scoreA) row.coachBWins++;
    else row.ties++;
    row.results.push({ season, week: Number(game.week) || null, scoreA, scoreB, winner: scoreA > scoreB ? coachA : scoreB > scoreA ? coachB : 'Tie', index });
  }

  return [...records.values()].map(row => {
    row.results.sort((a, b) => a.season - b.season || (a.week || 0) - (b.week || 0) || a.index - b.index);
    let streakCoach = null, streakCount = 0;
    for (let i = row.results.length - 1; i >= 0; i--) {
      const winner = row.results[i].winner;
      if (winner === 'Tie') break;
      if (streakCoach && streakCoach !== winner) break;
      streakCoach = winner;
      streakCount++;
    }
    return { ...row, latest: row.results.at(-1) || null, streak: { coachId: streakCoach, count: streakCount }, recentResults: row.results.slice(-3).reverse() };
  }).sort((a, b) => b.games - a.games || (b.latest?.season || 0) - (a.latest?.season || 0) || a.coachAName.localeCompare(b.coachAName));
}

module.exports = { buildCoachRivalries };
