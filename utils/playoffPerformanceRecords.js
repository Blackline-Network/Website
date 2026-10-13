'use strict';

const { getBracketRows, normalizeTeam } = require('./playoffHistory');

function isFinalScore(game) {
  return game?.status === 'final' && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && game.homeScore !== game.awayScore;
}

function buildPlayoffPerformanceRecords(dynasty, { maxSeasons = 30 } = {}) {
  const bracketRows = getBracketRows(dynasty).slice(0, Math.max(1, Math.min(30, maxSeasons)));
  const teams = new Map();
  const games = [];
  const seasonRuns = new Map();
  const championSeasons = new Map();
  const ensureTeam = name => {
    const key = normalizeTeam(name);
    if (!key) return null;
    if (!teams.has(key)) teams.set(key, { team: String(name).trim(), playoffAppearances: new Set(), wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, championships: 0, seasons: new Map() });
    return teams.get(key);
  };

  for (const row of bracketRows) {
    const season = row.season;
    const seasonWins = new Map();
    const seasonTeams = new Set();
    const rounds = Array.isArray(row.bracket.rounds) ? row.bracket.rounds : [];
    for (const round of rounds) {
      for (const game of Array.isArray(round?.games) ? round.games : []) {
        const homeTeam = String(game?.homeTeam ?? '').trim();
        const awayTeam = String(game?.awayTeam ?? '').trim();
        if (!homeTeam || !awayTeam || normalizeTeam(homeTeam) === normalizeTeam(awayTeam)) continue;
        const home = ensureTeam(homeTeam), away = ensureTeam(awayTeam);
        home.playoffAppearances.add(season); away.playoffAppearances.add(season);
        seasonTeams.add(normalizeTeam(homeTeam)); seasonTeams.add(normalizeTeam(awayTeam));
        if (!home.seasons.has(season)) home.seasons.set(season, { season, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 });
        if (!away.seasons.has(season)) away.seasons.set(season, { season, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, games: 0 });
        if (!isFinalScore(game)) continue;
        const homeWin = game.homeScore > game.awayScore;
        const winner = homeWin ? home : away;
        const loser = homeWin ? away : home;
        const margin = Math.abs(game.homeScore - game.awayScore);
        home.wins += homeWin ? 1 : 0; home.losses += homeWin ? 0 : 1;
        away.wins += homeWin ? 0 : 1; away.losses += homeWin ? 1 : 0;
        home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
        away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
        for (const [record, scored, conceded, win] of [[home.seasons.get(season), game.homeScore, game.awayScore, homeWin], [away.seasons.get(season), game.awayScore, game.homeScore, !homeWin]]) {
          record.games++; record.pointsFor += scored; record.pointsAgainst += conceded;
          if (win) record.wins++; else record.losses++;
        }
        seasonWins.set(normalizeTeam(winner.team), (seasonWins.get(normalizeTeam(winner.team)) || 0) + 1);
        games.push({ season, round: String(round.name || `Round ${round.round ?? '?'}`), homeTeam, awayTeam,
          homeScore: game.homeScore, awayScore: game.awayScore, winner: winner.team, loser: loser.team,
          margin, totalPoints: game.homeScore + game.awayScore, archived: row.archived });
      }
    }
    for (const key of seasonTeams) {
      const record = teams.get(key);
      const seasonRecord = record?.seasons.get(season);
      if (seasonRecord?.games) {
        if (!seasonRuns.has(key)) seasonRuns.set(key, []);
        seasonRuns.get(key).push({ team: record.team, season, wins: seasonRecord.wins, losses: seasonRecord.losses, games: seasonRecord.games, pointDifferential: seasonRecord.pointsFor - seasonRecord.pointsAgainst });
      }
    }
    const champion = String(row.champion || row.bracket.champion || '').trim();
    if (champion) {
      const record = ensureTeam(champion);
      record.championships++;
      if (!championSeasons.has(normalizeTeam(champion))) championSeasons.set(normalizeTeam(champion), []);
      championSeasons.get(normalizeTeam(champion)).push(season);
    }
  }

  const teamRecords = [...teams.values()].map(record => ({
    team: record.team, playoffAppearances: record.playoffAppearances.size, seasons: [...record.playoffAppearances].sort((a, b) => b - a),
    wins: record.wins, losses: record.losses, games: record.wins + record.losses,
    winPercentage: (record.wins + record.losses) ? record.wins / (record.wins + record.losses) : 0,
    pointDifferential: record.pointsFor - record.pointsAgainst, pointsFor: record.pointsFor,
    championships: record.championships, championshipSeasons: championSeasons.get(normalizeTeam(record.team)) || []
  })).sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage || b.championships - a.championships || a.team.localeCompare(b.team));

  const bestRuns = [...seasonRuns.values()].flat().sort((a, b) => b.wins - a.wins || b.winPercentage - a.winPercentage || b.pointDifferential - a.pointDifferential || a.team.localeCompare(b.team));
  const largestWins = [...games].sort((a, b) => b.margin - a.margin || b.totalPoints - a.totalPoints || b.season - a.season).slice(0, 10);
  const highestScoringGames = [...games].sort((a, b) => b.totalPoints - a.totalPoints || b.margin - a.margin || b.season - a.season).slice(0, 10);
  const mostPointsByTeam = [...games].flatMap(game => [
    { team: game.homeTeam, points: game.homeScore, opponent: game.awayTeam, opponentPoints: game.awayScore, season: game.season, round: game.round, winner: game.winner },
    { team: game.awayTeam, points: game.awayScore, opponent: game.homeTeam, opponentPoints: game.homeScore, season: game.season, round: game.round, winner: game.winner }
  ]).sort((a, b) => b.points - a.points || b.season - a.season).slice(0, 10);

  return {
    seasonsReviewed: bracketRows.length,
    finalizedGames: games.length,
    teamRecords: teamRecords.slice(0, 20),
    allTeamRecords: teamRecords,
    mostSuccessfulRuns: bestRuns.slice(0, 10).map(row => ({ ...row, winPercentage: row.games ? row.wins / row.games : 0 })),
    largestWins,
    highestScoringGames,
    mostPointsByTeam,
    note: bracketRows.length ? 'Records use only finalized, non-tied scores found in saved current and archived playoff brackets. Missing brackets and unrecorded rounds cannot be reconstructed.' : 'No saved playoff brackets are available yet; no performance records can be calculated.'
  };
}

module.exports = { buildPlayoffPerformanceRecords, isFinalScore };
