'use strict';

function normalizeTeam(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function displayTeam(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
function validFinalGames(dynasty) {
  return (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).filter(game => {
    const home = displayTeam(game?.homeTeam), away = displayTeam(game?.awayTeam);
    return game?.status === 'final' && home && away && normalizeTeam(home) !== normalizeTeam(away) &&
      Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) && game.homeScore >= 0 && game.awayScore >= 0 &&
      Number.isFinite(Number(game.season));
  }).map(game => ({
    season: Number(game.season), week: Number.isFinite(Number(game.week)) ? Number(game.week) : null,
    homeTeam: displayTeam(game.homeTeam), awayTeam: displayTeam(game.awayTeam),
    homeScore: Number(game.homeScore), awayScore: Number(game.awayScore)
  })).sort((a, b) => a.season - b.season || (a.week ?? 0) - (b.week ?? 0) || a.homeTeam.localeCompare(b.homeTeam));
}
function buildDynastyRecordBook(dynasty = {}) {
  const games = validFinalGames(dynasty);
  const teams = new Map();
  const seasonTeams = new Map();
  const addTeam = (name, season) => {
    const key = normalizeTeam(name);
    if (!teams.has(key)) teams.set(key, { team: name, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 });
    const seasonKey = `${key}\u0000${season}`;
    if (!seasonTeams.has(seasonKey)) seasonTeams.set(seasonKey, { team: name, season, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 });
    return [teams.get(key), seasonTeams.get(seasonKey)];
  };
  const scoringPerformances = [], largestWins = [], highestScoringGames = [];
  for (const game of games) {
    const totalPoints = game.homeScore + game.awayScore;
    const margin = Math.abs(game.homeScore - game.awayScore);
    highestScoringGames.push({ ...game, totalPoints });
    if (game.homeScore !== game.awayScore) {
      const winner = game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam;
      const loser = game.homeScore > game.awayScore ? game.awayTeam : game.homeTeam;
      const winnerScore = Math.max(game.homeScore, game.awayScore), loserScore = Math.min(game.homeScore, game.awayScore);
      largestWins.push({ season: game.season, week: game.week, winner, loser, winnerScore, loserScore, margin });
    }
    for (const side of [
      { team: game.homeTeam, points: game.homeScore, opponent: game.awayTeam, opponentPoints: game.awayScore },
      { team: game.awayTeam, points: game.awayScore, opponent: game.homeTeam, opponentPoints: game.homeScore }
    ]) scoringPerformances.push({ ...side, season: game.season, week: game.week, margin: side.points - side.opponentPoints });
    const [homeAll, homeSeason] = addTeam(game.homeTeam, game.season);
    const [awayAll, awaySeason] = addTeam(game.awayTeam, game.season);
    for (const row of [homeAll, homeSeason]) { row.games++; row.pointsFor += game.homeScore; row.pointsAgainst += game.awayScore; }
    for (const row of [awayAll, awaySeason]) { row.games++; row.pointsFor += game.awayScore; row.pointsAgainst += game.homeScore; }
    if (game.homeScore > game.awayScore) { homeAll.wins++; homeSeason.wins++; awayAll.losses++; awaySeason.losses++; }
    else if (game.homeScore < game.awayScore) { awayAll.wins++; awaySeason.wins++; homeAll.losses++; homeSeason.losses++; }
    else { homeAll.ties++; homeSeason.ties++; awayAll.ties++; awaySeason.ties++; }
  }
  const pct = row => row.games ? (row.wins + row.ties * 0.5) / row.games : 0;
  const recordSort = (a, b) => b.wins - a.wins || pct(b) - pct(a) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) || a.team.localeCompare(b.team);
  const careerLeaders = [...teams.values()].sort(recordSort).map(row => ({ ...row, winPercentage: pct(row), pointDifferential: row.pointsFor - row.pointsAgainst }));
  const seasonRecords = [...seasonTeams.values()].sort((a, b) => b.wins - a.wins || pct(b) - pct(a) || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) || b.season - a.season || a.team.localeCompare(b.team))
    .map(row => ({ ...row, winPercentage: pct(row), pointDifferential: row.pointsFor - row.pointsAgainst }));
  scoringPerformances.sort((a, b) => b.points - a.points || b.margin - a.margin || a.season - b.season || a.team.localeCompare(b.team));
  largestWins.sort((a, b) => b.margin - a.margin || b.winnerScore - a.winnerScore || a.season - b.season || a.winner.localeCompare(b.winner));
  highestScoringGames.sort((a, b) => b.totalPoints - a.totalPoints || Math.abs(b.homeScore - b.awayScore) - Math.abs(a.homeScore - a.awayScore) || a.season - b.season);
  const nationalTitles = Array.isArray(dynasty.championshipHistory) ? dynasty.championshipHistory : [];
  const conferenceTitles = Array.isArray(dynasty.conferenceChampionsHistory) ? dynasty.conferenceChampionsHistory : [];
  const titlesByTeam = new Map();
  const addTitle = (team, kind) => {
    const key = normalizeTeam(team); if (!key) return;
    if (!titlesByTeam.has(key)) titlesByTeam.set(key, { team: displayTeam(team), nationalTitles: 0, conferenceTitles: 0 });
    titlesByTeam.get(key)[kind]++;
  };
  for (const row of nationalTitles) addTitle(row?.champion, 'nationalTitles');
  for (const row of conferenceTitles) addTitle(row?.champion || row?.team || row?.winner, 'conferenceTitles');
  const championshipLeaders = [...titlesByTeam.values()].sort((a, b) => b.nationalTitles - a.nationalTitles || b.conferenceTitles - a.conferenceTitles || a.team.localeCompare(b.team));
  return {
    gamesReviewed: games.length,
    seasonsReviewed: new Set(games.map(game => game.season)).size,
    careerLeaders, seasonRecords, singleGameScoring: scoringPerformances,
    largestWins, highestScoringGames, championshipLeaders,
    note: 'Only finalized, valid schedule results and explicitly recorded championship history are included. Playoff-only results not present in the saved schedule are not merged into regular-season records; missing history is not inferred.'
  };
}
module.exports = { buildDynastyRecordBook, validFinalGames, normalizeTeam };
