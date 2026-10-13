'use strict';

const { buildPlayoffPicture, normalizeTeam } = require('./playoffPicture');

const OUTCOMES = [
  { homeScore: 24, awayScore: 21 },
  { homeScore: 21, awayScore: 24 },
  { homeScore: 21, awayScore: 21 }
];

function currentSeasonRemainingGames(dynasty) {
  const season = Number(dynasty?.season);
  return (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .map((game, index) => ({ game, index }))
    .filter(({ game }) => Number(game?.season) === season && game?.status !== 'final' &&
      String(game?.homeTeam || '').trim() && String(game?.awayTeam || '').trim() &&
      normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam));
}

/**
 * Enumerates every W/L/T combination for remaining scheduled games when the
 * remaining slate is small enough. Results are projections under the same
 * deterministic model as the Playoff Picture, never official qualification.
 * If the slate is too large, it refuses to label teams clinched/eliminated.
 */
function buildPlayoffClinchingTracker(dynasty, { maxEnumeratedGames = 8, fieldSize = 12 } = {}) {
  const current = buildPlayoffPicture(dynasty, { fieldSize });
  const remaining = currentSeasonRemainingGames(dynasty);
  const allTeams = [];
  const addTeam = value => {
    const team = String(value ?? '').trim();
    if (team && team !== 'N/A' && !allTeams.some(existing => normalizeTeam(existing) === normalizeTeam(team))) allTeams.push(team);
  };
  for (const row of Array.isArray(dynasty?.teamSelections) ? dynasty.teamSelections : []) addTeam(row?.team);
  for (const team of Array.isArray(dynasty?.rankings) ? dynasty.rankings : []) addTeam(team);
  for (const record of Array.isArray(dynasty?.seasonRankings) ? dynasty.seasonRankings : []) {
    if (Number(record?.season) === Number(dynasty?.season) && Array.isArray(record.teams)) record.teams.forEach(item => addTeam(typeof item === 'string' ? item : item?.team));
  }
  for (const { game } of remaining) { addTeam(game.homeTeam); addTeam(game.awayTeam); }
  current.projected.forEach(row => addTeam(row.team));
  current.bubble.forEach(row => addTeam(row.team));

  if (remaining.length > maxEnumeratedGames) {
    return {
      season: current.season, exact: false, scenariosEvaluated: 0, remainingGames: remaining.length,
      maxEnumeratedGames, projected: current.projected, clinched: [], eliminated: [], bubble: allTeams.map(team => ({ team, status: 'undetermined' })),
      note: `There are ${remaining.length} unplayed scheduled games. Exact scenario enumeration is limited to ${maxEnumeratedGames} or fewer games, so no team is labeled clinched or eliminated. The current field remains a projection only.`
    };
  }

  const possibleFields = new Map();
  const originalGames = Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [];
  const workingGames = originalGames.map(game => ({ ...game }));
  let scenariosEvaluated = 0;
  const evaluate = () => {
    const scenarioDynasty = { ...dynasty, scheduleGames: workingGames };
    const picture = buildPlayoffPicture(scenarioDynasty, { fieldSize });
    const set = new Set(picture.projected.map(row => normalizeTeam(row.team)));
    for (const team of allTeams) {
      const key = normalizeTeam(team);
      if (!possibleFields.has(key)) possibleFields.set(key, { team, appearances: 0, misses: 0 });
      const stat = possibleFields.get(key);
      if (set.has(key)) stat.appearances++;
      else stat.misses++;
    }
    scenariosEvaluated++;
  };
  const visit = depth => {
    if (depth >= remaining.length) { evaluate(); return; }
    const { index } = remaining[depth];
    const original = originalGames[index];
    for (const outcome of OUTCOMES) {
      workingGames[index] = { ...original, status: 'final', homeScore: outcome.homeScore, awayScore: outcome.awayScore, scenarioOnly: true };
      visit(depth + 1);
    }
    workingGames[index] = { ...original };
  };
  visit(0);

  const clinched = [], eliminated = [], bubble = [];
  for (const team of allTeams) {
    const stat = possibleFields.get(normalizeTeam(team)) || { appearances: 0, misses: scenariosEvaluated };
    if (stat.appearances === scenariosEvaluated && scenariosEvaluated > 0) clinched.push({ team, scenariosIn: stat.appearances, totalScenarios: scenariosEvaluated });
    else if (stat.appearances === 0) eliminated.push({ team, scenariosOut: stat.misses, totalScenarios: scenariosEvaluated });
    else bubble.push({ team, scenariosIn: stat.appearances, totalScenarios: scenariosEvaluated });
  }
  const currentSet = new Set(current.projected.map(row => normalizeTeam(row.team)));
  const currentBubbleSet = new Set(current.bubble.map(row => normalizeTeam(row.team)));
  const orderByCurrentPicture = (a, b) => {
    const aKey = normalizeTeam(a.team), bKey = normalizeTeam(b.team);
    const aRank = current.projected.findIndex(row => normalizeTeam(row.team) === aKey);
    const bRank = current.projected.findIndex(row => normalizeTeam(row.team) === bKey);
    const aBubble = current.bubble.findIndex(row => normalizeTeam(row.team) === aKey);
    const bBubble = current.bubble.findIndex(row => normalizeTeam(row.team) === bKey);
    return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank) ||
      (aBubble < 0 ? 999 : aBubble) - (bBubble < 0 ? 999 : bBubble) || a.team.localeCompare(b.team);
  };
  clinched.sort(orderByCurrentPicture); eliminated.sort(orderByCurrentPicture); bubble.sort(orderByCurrentPicture);
  return {
    season: current.season, exact: true, scenariosEvaluated, remainingGames: remaining.length,
    projected: current.projected, clinched, eliminated, bubble,
    note: `Enumerated ${scenariosEvaluated} W/L/T combinations across ${remaining.length} remaining scheduled games using fixed illustrative scores (24–21, 21–24, 21–21). “Locked” and “outside” describe this model only; score margins and tiebreakers beyond these assumptions can change the field. This is not official qualification or the official bracket.`,
    currentProjectedTeams: [...currentSet], currentBubbleTeams: [...currentBubbleSet]
  };
}

module.exports = { buildPlayoffClinchingTracker, currentSeasonRemainingGames };
