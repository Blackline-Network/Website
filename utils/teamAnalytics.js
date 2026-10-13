'use strict';

function normalizeTeam(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function validFinalGames(dynasty, teamName, season = null) {
  const key = normalizeTeam(teamName);
  if (!key) return [];
  return (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(g => g && g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore)
      && Number.isFinite(Number(g.season))
      && (season === null || Number(g.season) === Number(season))
      && (normalizeTeam(g.homeTeam) === key || normalizeTeam(g.awayTeam) === key))
    .slice()
    .sort((a, b) => Number(a.season) - Number(b.season) || Number(a.week || 0) - Number(b.week || 0));
}
function blankSplit() { return { games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }; }
function addResult(split, scored, allowed) {
  split.games++; split.pointsFor += scored; split.pointsAgainst += allowed;
  if (scored > allowed) split.wins++;
  else if (scored < allowed) split.losses++;
  else split.ties++;
}
function recordLabel(r) { return `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`; }
function calculateTeamAnalytics(dynasty, teamName, season = null) {
  const games = validFinalGames(dynasty, teamName, season);
  const key = normalizeTeam(teamName);
  const home = blankSplit(), away = blankSplit(), overall = blankSplit();
  const seasons = new Map();
  let shutouts = 0, oneScoreGames = 0, biggestWin = null, biggestLoss = null;
  const outcomes = [];
  for (const game of games) {
    const isHome = normalizeTeam(game.homeTeam) === key;
    const scored = Number(isHome ? game.homeScore : game.awayScore);
    const allowed = Number(isHome ? game.awayScore : game.homeScore);
    const margin = scored - allowed;
    addResult(overall, scored, allowed);
    addResult(isHome ? home : away, scored, allowed);
    const seasonKey = Number(game.season);
    if (!seasons.has(seasonKey)) seasons.set(seasonKey, { season: seasonKey, ...blankSplit() });
    addResult(seasons.get(seasonKey), scored, allowed);
    if (allowed === 0) shutouts++;
    if (Math.abs(margin) <= 7) oneScoreGames++;
    const item = { season: seasonKey, week: Number(game.week || 0), opponent: String(isHome ? game.awayTeam : game.homeTeam), scored, allowed, margin };
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin || (margin === biggestWin.margin && scored > biggestWin.scored))) biggestWin = item;
    if (margin < 0 && (!biggestLoss || margin < biggestLoss.margin || (margin === biggestLoss.margin && allowed > biggestLoss.allowed))) biggestLoss = item;
    outcomes.push({ ...item, result: margin > 0 ? 'W' : margin < 0 ? 'L' : 'T' });
  }
  const winPct = r => r.games ? (r.wins + r.ties * 0.5) / r.games : 0;
  const seasonRows = [...seasons.values()].sort((a, b) => a.season - b.season).map(r => ({
    ...r, winPercentage: winPct(r), pointsPerGame: r.games ? r.pointsFor / r.games : 0,
    pointsAllowedPerGame: r.games ? r.pointsAgainst / r.games : 0,
    pointDifferential: r.pointsFor - r.pointsAgainst
  }));
  const rankedSeasons = seasonRows.filter(r => r.games).slice().sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins || b.pointDifferential - a.pointDifferential || a.season - b.season);
  let currentStreak = { type: null, count: 0 }, longestWinStreak = 0, runningWinStreak = 0;
  for (const game of outcomes.slice().reverse()) {
    if (currentStreak.count === 0) currentStreak.type = game.result;
    if (game.result === currentStreak.type) currentStreak.count++;
    else break;
  }
  for (const game of outcomes) {
    if (game.result === 'W') { runningWinStreak++; longestWinStreak = Math.max(longestWinStreak, runningWinStreak); }
    else runningWinStreak = 0;
  }
  const rate = r => r.games ? (r.wins + r.ties * 0.5) / r.games : 0;
  return {
    teamName: String(teamName ?? '').trim(), season: season === null ? null : Number(season), games: games.length,
    overall: { ...overall, winPercentage: rate(overall), pointsPerGame: overall.games ? overall.pointsFor / overall.games : 0,
      pointsAllowedPerGame: overall.games ? overall.pointsAgainst / overall.games : 0, pointDifferential: overall.pointsFor - overall.pointsAgainst },
    home: { ...home, winPercentage: rate(home), pointDifferential: home.pointsFor - home.pointsAgainst },
    away: { ...away, winPercentage: rate(away), pointDifferential: away.pointsFor - away.pointsAgainst },
    seasons: seasonRows, bestSeason: rankedSeasons[0] || null, worstSeason: rankedSeasons[rankedSeasons.length - 1] || null,
    shutouts, oneScoreGames, biggestWin, biggestLoss, currentStreak, longestWinStreak,
    note: 'Calculated from recorded finalized games only; unplayed and invalid-score games are excluded.'
  };
}
module.exports = { calculateTeamAnalytics, validFinalGames, normalizeTeam, recordLabel };
