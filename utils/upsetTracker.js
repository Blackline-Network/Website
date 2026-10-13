'use strict';

function norm(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function validFinal(game) {
  return game?.status === 'final' && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && norm(game.homeTeam) && norm(game.awayTeam) && norm(game.homeTeam) !== norm(game.awayTeam);
}

/** Build pregame standings using only finalized games from earlier weeks in the same season. */
function rankBeforeGame(dynasty, game) {
  const season = Number(game.season ?? dynasty?.season);
  const week = Number(game.week ?? 0);
  const rows = new Map();
  const get = name => {
    const key = norm(name); if (!key) return null;
    if (!rows.has(key)) rows.set(key, { team: String(name).trim(), wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 });
    return rows.get(key);
  };
  for (const selection of dynasty?.teamSelections || []) get(selection?.team);
  for (const name of dynasty?.rankings || []) if (name && name !== 'N/A') get(name);
  const prior = (dynasty?.scheduleGames || []).filter(g => validFinal(g) && Number(g.season) === season && Number(g.week ?? 0) < week);
  for (const g of prior) {
    const home = get(g.homeTeam), away = get(g.awayTeam); if (!home || !away) continue;
    home.games++; away.games++; home.pointsFor += g.homeScore; home.pointsAgainst += g.awayScore; away.pointsFor += g.awayScore; away.pointsAgainst += g.homeScore;
    if (g.homeScore > g.awayScore) { home.wins++; away.losses++; }
    else if (g.homeScore < g.awayScore) { away.wins++; home.losses++; }
    else { home.ties++; away.ties++; }
  }
  const ordered = [...rows.values()].sort((a, b) => {
    const pct = r => (r.wins + r.ties * 0.5) / Math.max(1, r.games);
    return (b.games > 0) - (a.games > 0) || pct(b) - pct(a) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) || b.pointsFor - a.pointsFor || a.team.localeCompare(b.team);
  });
  return Object.fromEntries(ordered.map((row, i) => [norm(row.team), { rank: i + 1, record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`, games: row.games }]));
}

function capturePreGameRanks(dynasty, game) {
  if (!game || game.preGameRanks) return game?.preGameRanks || null;
  const ranked = rankBeforeGame(dynasty, game);
  const home = ranked[norm(game.homeTeam)], away = ranked[norm(game.awayTeam)];
  if (!home || !away) return null;
  game.preGameRanks = { homeRank: home.rank, awayRank: away.rank, homeRecord: home.record, awayRecord: away.record, homeGames: home.games, awayGames: away.games, source: 'earlier-weeks', capturedAt: new Date().toISOString() };
  return game.preGameRanks;
}

function buildUpsetTracker(dynasty, { season = dynasty?.season, limit = 15 } = {}) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(g => validFinal(g) && Number(g.season) === Number(season))
    .sort((a, b) => Number(a.week || 0) - Number(b.week || 0));
  const out = [];
  for (const game of games) {
    if (game.homeScore === game.awayScore) continue;
    const snapshot = game.preGameRanks;
    const ranks = snapshot ? null : rankBeforeGame(dynasty, game);
    const homeBefore = ranks?.[norm(game.homeTeam)];
    const awayBefore = ranks?.[norm(game.awayTeam)];
    const homeGames = Number(snapshot?.homeGames ?? homeBefore?.games ?? 0);
    const awayGames = Number(snapshot?.awayGames ?? awayBefore?.games ?? 0);
    const homeRank = Number(snapshot?.homeRank ?? homeBefore?.rank);
    const awayRank = Number(snapshot?.awayRank ?? awayBefore?.rank);
    if (homeGames < 1 || awayGames < 1 || !Number.isInteger(homeRank) || !Number.isInteger(awayRank) || homeRank === awayRank) continue;
    const homeWon = game.homeScore > game.awayScore;
    const winner = homeWon ? game.homeTeam : game.awayTeam;
    const loser = homeWon ? game.awayTeam : game.homeTeam;
    const winnerRank = homeWon ? homeRank : awayRank, loserRank = homeWon ? awayRank : homeRank;
    if (winnerRank <= loserRank) continue;
    out.push({ season: Number(game.season), week: Number(game.week || 0), winner, loser, winnerRank, loserRank, rankGap: winnerRank - loserRank, score: `${game.homeScore}-${game.awayScore}`, gameId: game.id || null, rankingSource: snapshot ? 'captured' : 'reconstructed-earlier-weeks' });
  }
  return out.sort((a, b) => b.rankGap - a.rankGap || b.season - a.season || b.week - a.week).slice(0, Math.max(1, Math.min(25, Number(limit) || 15)));
}

module.exports = { rankBeforeGame, capturePreGameRanks, buildUpsetTracker };
