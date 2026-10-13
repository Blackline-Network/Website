'use strict';

function validateLeagueResult({ week, homeTeam, awayTeam, homeScore, awayScore }) {
  if (!Number.isInteger(Number(week)) || Number(week) < 0 || Number(week) > 15) {
    return 'Week must be a whole number from 0 through 15.';
  }
  if (typeof homeTeam !== 'string' || !homeTeam.trim() || typeof awayTeam !== 'string' || !awayTeam.trim()) {
    return 'Both home and away teams are required.';
  }
  const norm = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (norm(homeTeam) === norm(awayTeam)) return 'Home and away teams must be different.';
  for (const [label, score] of [['Home', homeScore], ['Away', awayScore]]) {
    if (!Number.isInteger(score)) return `${label} score must be a whole number.`;
    if (score < 0 || score > 300) return `${label} score must be between 0 and 300.`;
  }
  return null;
}

function getPreviousResult(game) {
  if (!game || game.status !== 'final') return null;
  if (!Number.isInteger(game.homeScore) || !Number.isInteger(game.awayScore)) return 'invalid-final-score';
  return `${game.homeScore}-${game.awayScore}`;
}

module.exports = { validateLeagueResult, getPreviousResult };
