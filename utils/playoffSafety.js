'use strict';

function finalizedPlayoffGames(bracket) {
  if (!bracket || !Array.isArray(bracket.rounds)) return [];
  return bracket.rounds.flatMap(round => Array.isArray(round.games) ? round.games : [])
    .filter(game => game && (game.status === 'final' || (Number.isInteger(game.homeScore) && Number.isInteger(game.awayScore) && game.winner)));
}

function bracketReplacementError(bracket, season) {
  if (!bracket || Number(bracket.season) !== Number(season)) return null;
  const finalized = finalizedPlayoffGames(bracket);
  if (finalized.length) {
    return `This season's bracket already has ${finalized.length} finalized playoff game(s). To protect recorded results, BLACKLINE will not replace or reseed it. Review the existing bracket or use your documented manual recovery procedure if a correction is required.`;
  }
  return null;
}

function validatePlayoffScore(homeScore, awayScore) {
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return 'Both scores must be whole numbers.';
  if (homeScore < 0 || awayScore < 0) return 'Scores cannot be negative.';
  if (homeScore > 300 || awayScore > 300) return 'Scores must be 300 or lower; verify the entry.';
  if (homeScore === awayScore) return 'Playoff games cannot end in a tie. Enter the final score after overtime.';
  return null;
}

module.exports = { finalizedPlayoffGames, bracketReplacementError, validatePlayoffScore };
