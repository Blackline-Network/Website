'use strict';
const { auditSeasonSchedule, isValidScore } = require('./seasonIntegrity');

/**
 * Validate the current season before moving its phase forward. This is a guard,
 * not a replacement for the season audit: it only blocks on structural errors
 * or unfinished games in the active numbered week.
 */
function checkAdvancePreflight(dynasty) {
  const audit = auditSeasonSchedule(dynasty, dynasty?.season);
  const blockers = audit.findings
    .filter(item => item.severity === 'error')
    .map(item => item.message);

  const phase = String(dynasty?.currentPhase || '');
  const weekMatch = phase.match(/^week(\d+)$/i);
  let activeWeek = null;
  let unresolvedGames = [];
  if (weekMatch) {
    activeWeek = Number(weekMatch[1]);
    const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
      .filter(game => Number(game.season) === Number(dynasty?.season)
        && Number(game.week) === activeWeek
        && game.status !== 'cancelled');
    unresolvedGames = games.filter(game => game.status !== 'final'
      || !isValidScore(game.homeScore) || !isValidScore(game.awayScore));
    if (unresolvedGames.length) {
      blockers.push(`Week ${activeWeek} still has ${unresolvedGames.length} game(s) without valid final scores.`);
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: audit.findings.filter(item => item.severity === 'warning').map(item => item.message),
    activeWeek,
    unresolvedGames: unresolvedGames.length,
    auditErrors: audit.errors,
    auditWarnings: audit.warnings
  };
}

module.exports = { checkAdvancePreflight };
