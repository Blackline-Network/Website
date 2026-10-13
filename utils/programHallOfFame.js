'use strict';

const { programNamesFor, calculateProgramProfile, normalizeTeam } = require('./programRecords');
const { buildPlayoffPerformanceRecords } = require('./playoffPerformanceRecords');

/**
 * Builds a descriptive, read-only program Hall of Fame from recorded league history.
 * Points are intentionally transparent rather than presented as an official poll:
 * national title 12, conference title 5, playoff appearance 2, playoff win 1,
 * recorded winning season 1, Heisman winner 2, draft pick 0.5, other award 1.
 */
function buildProgramHallOfFame(dynasty, { limit = 20 } = {}) {
  const playoff = buildPlayoffPerformanceRecords(dynasty);
  const playoffByTeam = new Map((playoff.allTeamRecords || playoff.teamRecords).map(row => [normalizeTeam(row.team), row]));
  const programs = programNamesFor(dynasty).map(team => {
    const profile = calculateProgramProfile(dynasty, team);
    const record = profile.record;
    const games = record.wins + record.losses + record.ties;
    const winningSeasons = [...record.seasons.values()].filter(season => season.games > 0 && season.wins > season.losses).length;
    const playoffRecord = playoffByTeam.get(normalizeTeam(team)) || {
      playoffAppearances: 0, wins: 0, losses: 0, championships: 0, pointDifferential: 0, seasons: []
    };
    const nationalTitles = profile.titles.length;
    const conferenceTitles = profile.conferenceTitles.length;
    const heismanWinners = profile.heismans.length;
    const draftPicks = profile.draftPicks.length;
    const otherAwards = profile.awards.length;
    const points = nationalTitles * 12 + conferenceTitles * 5 + playoffRecord.playoffAppearances * 2 +
      playoffRecord.wins + winningSeasons + heismanWinners * 2 + draftPicks * 0.5 + otherAwards;
    return {
      team, points, overallRecord: { wins: record.wins, losses: record.losses, ties: record.ties, games },
      winPercentage: games ? (record.wins + record.ties * 0.5) / games : 0,
      pointDifferential: record.pf - record.pa,
      nationalTitles, conferenceTitles, playoffAppearances: playoffRecord.playoffAppearances,
      playoffWins: playoffRecord.wins, playoffLosses: playoffRecord.losses,
      winningSeasons, heismanWinners, draftPicks, otherAwards,
      recordedGames: games, recordedSeasons: record.seasons.size
    };
  }).sort((a, b) => b.points - a.points || b.nationalTitles - a.nationalTitles ||
    b.conferenceTitles - a.conferenceTitles || b.overallRecord.wins - a.overallRecord.wins ||
    b.playoffWins - a.playoffWins || a.team.localeCompare(b.team));

  return {
    programs: programs.slice(0, Math.max(1, Math.min(50, Number(limit) || 20))).map((row, index) => ({ rank: index + 1, ...row })),
    programsReviewed: programs.length,
    recordedPlayoffGames: playoff.finalizedGames,
    seasonsReviewed: playoff.seasonsReviewed,
    scoring: 'National title 12 pts; conference title 5; playoff appearance 2; playoff win 1; recorded winning season 1; Heisman winner 2; draft pick 0.5; other recorded award 1.',
    note: 'This is a descriptive Hall of Fame score, not an official league poll. It uses only currently saved final game results, bracket history, and award records. Missing history is not inferred.'
  };
}

module.exports = { buildProgramHallOfFame };
