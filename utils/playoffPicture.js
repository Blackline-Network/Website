'use strict';

function normalizeTeam(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function validFinal(game, season) {
  return Number(game?.season) === Number(season) && game?.status === 'final' &&
    Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) && game.homeScore >= 0 && game.awayScore >= 0 &&
    normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) && normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam);
}
function buildPlayoffPicture(dynasty, { fieldSize = 12, bubbleSize = 4 } = {}) {
  const season = Number(dynasty?.season);
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(game => Number(game?.season) === season && normalizeTeam(game?.homeTeam) && normalizeTeam(game?.awayTeam) && normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam));
  const standings = new Map();
  const ensure = team => {
    const key = normalizeTeam(team);
    if (!key) return null;
    if (!standings.has(key)) standings.set(key, { team: String(team).trim(), wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0, remaining: 0 });
    return standings.get(key);
  };
  for (const selection of Array.isArray(dynasty?.teamSelections) ? dynasty.teamSelections : []) ensure(selection?.team);
  for (const game of games) {
    const home = ensure(game.homeTeam), away = ensure(game.awayTeam);
    if (validFinal(game, season)) {
      for (const [row, pf, pa] of [[home, game.homeScore, game.awayScore], [away, game.awayScore, game.homeScore]]) {
        row.games++; row.pointsFor += pf; row.pointsAgainst += pa;
        if (pf > pa) row.wins++; else if (pf < pa) row.losses++; else row.ties++;
      }
    } else if (game.status !== 'final') {
      if (home) home.remaining++;
      if (away) away.remaining++;
    }
  }
  const pct = row => row.games ? (row.wins + row.ties * 0.5) / row.games : 0;
  const standingRows = [...standings.values()].map(row => ({ ...row, winPercentage: pct(row), pointDifferential: row.pointsFor - row.pointsAgainst,
    record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}` }))
    .sort((a, b) => b.winPercentage - a.winPercentage || b.pointDifferential - a.pointDifferential || b.pointsFor - a.pointsFor || a.team.localeCompare(b.team));
  const standingPosition = new Map(standingRows.map((row, index) => [normalizeTeam(row.team), index]));
  const latestRanking = (Array.isArray(dynasty?.seasonRankings) ? dynasty.seasonRankings : [])
    .filter(record => Number(record?.season) === season && Array.isArray(record?.teams))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  const ordered = [...(latestRanking?.teams || []), ...(Array.isArray(dynasty?.rankings) ? dynasty.rankings : []), ...standingRows.map(row => row.team),
    ...(Array.isArray(dynasty?.teamSelections) ? dynasty.teamSelections.map(row => row?.team) : [])]
    .filter(team => team && team !== 'N/A').filter((team, index, all) => all.findIndex(other => normalizeTeam(other) === normalizeTeam(team)) === index);
  const conferenceMap = dynasty?.teamConferences && !Array.isArray(dynasty.teamConferences) ? dynasty.teamConferences : {};
  const conferenceFor = team => {
    const key = Object.keys(conferenceMap).find(candidate => normalizeTeam(candidate) === normalizeTeam(team));
    return key ? String(conferenceMap[key] || '').trim() : '';
  };
  const conferences = new Map();
  for (const team of ordered) {
    const conference = conferenceFor(team);
    if (!conference) continue;
    const key = normalizeTeam(conference);
    if (!conferences.has(key)) conferences.set(key, { conference, teams: [] });
    conferences.get(key).teams.push(team);
  }
  const rankingPosition = new Map(ordered.map((team, index) => [normalizeTeam(team), index]));
  const conferenceChampions = [...conferences.values()].map(group => ({ conference: group.conference,
    team: [...group.teams].sort((a, b) => (standingPosition.get(normalizeTeam(a)) ?? 99999) - (standingPosition.get(normalizeTeam(b)) ?? 99999) ||
      (rankingPosition.get(normalizeTeam(a)) ?? 99999) - (rankingPosition.get(normalizeTeam(b)) ?? 99999))[0] }))
    .sort((a, b) => (rankingPosition.get(normalizeTeam(a.team)) ?? 99999) - (rankingPosition.get(normalizeTeam(b.team)) ?? 99999));
  const automatic = conferenceChampions.slice(0, 5).map(item => item.team);
  const selected = new Set(automatic.map(normalizeTeam));
  const atLarge = ordered.filter(team => !selected.has(normalizeTeam(team))).slice(0, Math.max(0, fieldSize - automatic.length));
  const field = [...automatic, ...atLarge].slice(0, fieldSize);
  const fieldSet = new Set(field.map(normalizeTeam));
  const bubble = ordered.filter(team => !fieldSet.has(normalizeTeam(team))).slice(0, bubbleSize).map(team => ({ team, standing: standingRows.find(row => normalizeTeam(row.team) === normalizeTeam(team)) || null }));
  const byeTeams = conferenceChampions.slice(0, 4).map(item => item.team);
  for (const team of field) if (byeTeams.length < 4 && !byeTeams.some(existing => normalizeTeam(existing) === normalizeTeam(team))) byeTeams.push(team);
  const byeSet = new Set(byeTeams.map(normalizeTeam));
  const seeded = [...byeTeams, ...field.filter(team => !byeSet.has(normalizeTeam(team))).sort((a, b) =>
    (rankingPosition.get(normalizeTeam(a)) ?? 99999) - (rankingPosition.get(normalizeTeam(b)) ?? 99999))];
  const projected = seeded.map((team, index) => ({ seed: index + 1, team, bidType: automatic.some(t => normalizeTeam(t) === normalizeTeam(team)) ? 'Conference champion' : 'At-large',
    bye: index < 4, standing: standingRows.find(row => normalizeTeam(row.team) === normalizeTeam(team)) || null }));
  return { season, fieldSize, projected, bubble, conferenceChampions, conferenceAssignments: Object.keys(conferenceMap).length,
    teamsAvailable: ordered.length, gamesConsidered: games.filter(game => validFinal(game, season)).length,
    remainingGames: games.filter(game => game.status !== 'final').length,
    notes: ordered.length < fieldSize ? `Only ${ordered.length} distinct teams are available; a full ${fieldSize}-team projection is not yet possible.` :
      !conferences.size ? 'No conference assignments are recorded; automatic bids cannot be estimated.' :
      'Projection only, based on current saved rankings and results. This is not an official bracket, probability model, or clinching determination.' };
}
function getScenarioGames(dynasty, limit = 25) {
  const season = Number(dynasty?.season);
  return (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .map((game, index) => ({ game, index }))
    .filter(({ game }) => Number(game?.season) === season && game?.status !== 'final' &&
      normalizeTeam(game?.homeTeam) && normalizeTeam(game?.awayTeam) &&
      normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam))
    .slice(0, Math.max(0, Math.min(25, limit)))
    .map(({ game, index }) => ({ index, week: Number(game.week) || null, homeTeam: String(game.homeTeam), awayTeam: String(game.awayTeam), status: game.status || 'scheduled' }));
}

function simulatePlayoffScenario(dynasty, gameIndex, outcome, options = {}) {
  const allowed = new Set(['home-win', 'away-win', 'tie']);
  const index = Number(gameIndex);
  const originalGames = Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [];
  const selected = originalGames[index];
  if (!Number.isInteger(index) || index < 0 || !selected || Number(selected.season) !== Number(dynasty?.season) || selected.status === 'final' || !allowed.has(outcome)) {
    return { ok: false, error: 'Choose an available, unplayed game from the current season and a valid outcome.' };
  }
  const before = buildPlayoffPicture(dynasty, options);
  const scenarioDynasty = { ...dynasty, scheduleGames: originalGames.map((game, i) => i === index ? {
    ...game, status: 'final', scenarioOnly: true,
    homeScore: outcome === 'home-win' ? 24 : outcome === 'away-win' ? 21 : 21,
    awayScore: outcome === 'home-win' ? 21 : outcome === 'away-win' ? 24 : 21
  } : { ...game }) };
  const after = buildPlayoffPicture(scenarioDynasty, options);
  const beforeTeams = new Set(before.projected.map(row => normalizeTeam(row.team)));
  const afterTeams = new Set(after.projected.map(row => normalizeTeam(row.team)));
  const added = after.projected.filter(row => !beforeTeams.has(normalizeTeam(row.team))).map(row => row.team);
  const removed = before.projected.filter(row => !afterTeams.has(normalizeTeam(row.team))).map(row => row.team);
  return {
    ok: true,
    game: { index, week: Number(selected.week) || null, homeTeam: String(selected.homeTeam), awayTeam: String(selected.awayTeam) },
    outcome, assumedScore: outcome === 'home-win' ? '24–21' : outcome === 'away-win' ? '21–24' : '21–21',
    before: before.projected, after: after.projected, added, removed,
    note: 'What-if only: the selected unplayed game is temporarily treated as a 24–21, 21–24, or 21–21 final for this calculation. Saved league results and the official bracket are not changed.'
  };
}
module.exports = { buildPlayoffPicture, getScenarioGames, simulatePlayoffScenario, normalizeTeam };
