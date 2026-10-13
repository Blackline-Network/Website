'use strict';

function normalizeTeam(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Build head-to-head records from finalized, numeric league schedule results only. */
function buildRivalryTracker(dynasty) {
  const records = new Map();
  const games = Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [];
  for (const game of games) {
    if (game?.status !== 'final' || !Number.isFinite(game.homeScore) || !Number.isFinite(game.awayScore)) continue;
    const home = String(game.homeTeam || '').trim();
    const away = String(game.awayTeam || '').trim();
    const homeKey = normalizeTeam(home), awayKey = normalizeTeam(away);
    if (!homeKey || !awayKey || homeKey === awayKey) continue;
    const [firstKey, secondKey] = [homeKey, awayKey].sort();
    const key = `${firstKey}::${secondKey}`;
    if (!records.has(key)) {
      const firstName = firstKey === homeKey ? home : away;
      const secondName = secondKey === awayKey ? away : home;
      records.set(key, {
        key, teamA: firstName, teamB: secondName, games: 0,
        teamAWins: 0, teamBWins: 0, ties: 0,
        teamAPoints: 0, teamBPoints: 0, results: [], seasons: new Set()
      });
    }
    const row = records.get(key);
    const aIsHome = homeKey === firstKey;
    const scoreA = Number(aIsHome ? game.homeScore : game.awayScore);
    const scoreB = Number(aIsHome ? game.awayScore : game.homeScore);
    row.games++;
    row.teamAPoints += scoreA; row.teamBPoints += scoreB;
    if (scoreA > scoreB) row.teamAWins++;
    else if (scoreB > scoreA) row.teamBWins++;
    else row.ties++;
    const season = Number(game.season);
    row.seasons.add(Number.isFinite(season) ? season : 'Unknown');
    row.results.push({ season: Number.isFinite(season) ? season : null, week: Number(game.week) || null, scoreA, scoreB, winner: scoreA > scoreB ? row.teamA : scoreB > scoreA ? row.teamB : 'Tie', recordedAt: game.recordedAt || game.updatedAt || game.createdAt || null });
  }
  const rows = [...records.values()].map(row => {
    row.results.sort((a, b) => (Number(a.season) || 0) - (Number(b.season) || 0) || (Number(a.week) || 0) - (Number(b.week) || 0));
    const latest = row.results[row.results.length - 1] || null;
    let streak = { side: null, count: 0 };
    for (let i = row.results.length - 1; i >= 0; i--) {
      const winner = row.results[i].winner;
      if (winner === 'Tie') break;
      const side = normalizeTeam(winner) === normalizeTeam(row.teamA) ? 'A' : 'B';
      if (streak.side && streak.side !== side) break;
      streak.side = side; streak.count++;
    }
    return { ...row, seasons: [...row.seasons].sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))), latest, recentResults: row.results.slice(-3).reverse(), streak };
  });
  return rows.sort((a, b) => b.games - a.games || (Number(b.latest?.season) || 0) - (Number(a.latest?.season) || 0) || a.teamA.localeCompare(b.teamA) || a.teamB.localeCompare(b.teamB));
}

module.exports = { normalizeTeam, buildRivalryTracker };
