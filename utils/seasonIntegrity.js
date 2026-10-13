'use strict';

function norm(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function isValidScore(value) { return Number.isInteger(value) && value >= 0 && value <= 300; }

function auditSeasonSchedule(dynasty, season = dynasty?.season) {
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(game => Number(game.season) === Number(season));
  const findings = [];
  const seenMatchups = new Map();
  const teamWeek = new Map();
  const ids = new Set();

  for (const [index, game] of games.entries()) {
    const label = `Game ${index + 1}${game.id ? ` (${game.id})` : ''}`;
    const home = norm(game.homeTeam), away = norm(game.awayTeam);
    const week = Number(game.week);
    if (!home || !away) findings.push({ severity: 'error', code: 'missing-team', message: `${label} is missing a home or away team.` });
    if (home && away && home === away) findings.push({ severity: 'error', code: 'same-team', message: `${label} lists the same team on both sides.` });
    if (!Number.isInteger(week) || week < 0 || week > 15) findings.push({ severity: 'error', code: 'invalid-week', message: `${label} has invalid week '${game.week}'. Expected 0–15.` });
    if (game.id && ids.has(String(game.id))) findings.push({ severity: 'error', code: 'duplicate-id', message: `${label} duplicates a game ID.` });
    if (game.id) ids.add(String(game.id));

    if (home && away && home !== away && Number.isInteger(week)) {
      const pair = [home, away].sort().join('::');
      const matchupKey = `${week}::${pair}`;
      if (seenMatchups.has(matchupKey)) findings.push({ severity: 'error', code: 'duplicate-matchup', message: `${label} duplicates a matchup in Week ${week}.` });
      else seenMatchups.set(matchupKey, label);
      for (const team of [home, away]) {
        const key = `${week}::${team}`;
        if (teamWeek.has(key)) findings.push({ severity: 'error', code: 'team-double-booked', message: `${label} schedules a team more than once in Week ${week} (${game.homeTeam === game.awayTeam ? game.homeTeam : team}).` });
        else teamWeek.set(key, label);
      }
    }

    if (game.status === 'final') {
      if (!isValidScore(game.homeScore) || !isValidScore(game.awayScore)) findings.push({ severity: 'error', code: 'invalid-final-score', message: `${label} is marked final but has an invalid score.` });
    } else if (game.homeScore !== undefined && game.homeScore !== null || game.awayScore !== undefined && game.awayScore !== null) {
      findings.push({ severity: 'warning', code: 'score-on-unfinalized-game', message: `${label} has score data but is not marked final.` });
    }
    if (!['scheduled', 'final', 'pending', 'cancelled', undefined, null].includes(game.status)) {
      findings.push({ severity: 'warning', code: 'unknown-status', message: `${label} has an unrecognized status '${game.status}'.` });
    }
  }
  return { season: Number(season), games: games.length, errors: findings.filter(f => f.severity === 'error').length, warnings: findings.filter(f => f.severity === 'warning').length, findings };
}

function validateScheduledGame(dynasty, { week, homeTeam, awayTeam, ignoreGameId = null }) {
  const home = norm(homeTeam), away = norm(awayTeam);
  if (!home || !away) return 'Both home and away teams are required.';
  if (home === away) return 'Home and away teams must be different.';
  if (!Number.isInteger(Number(week)) || Number(week) < 0 || Number(week) > 15) return 'Week must be a whole number from 0 through 15.';
  const games = (dynasty.scheduleGames || []).filter(g => Number(g.season) === Number(dynasty.season) && String(g.id ?? '') !== String(ignoreGameId ?? ''));
  for (const game of games) {
    if (Number(game.week) !== Number(week) || game.status === 'cancelled') continue;
    const gHome = norm(game.homeTeam), gAway = norm(game.awayTeam);
    if ((gHome === home && gAway === away) || (gHome === away && gAway === home)) return `This matchup already exists in Week ${week}.`;
    if ([gHome, gAway].includes(home)) return `${homeTeam} already has a game in Week ${week}.`;
    if ([gHome, gAway].includes(away)) return `${awayTeam} already has a game in Week ${week}.`;
  }
  return null;
}

function seasonCloseError(dynasty) {
  const audit = auditSeasonSchedule(dynasty, dynasty.season);
  if (audit.errors) return `Season schedule has ${audit.errors} integrity error(s). Run /league season-audit and resolve them before closing.`;
  const games = (dynasty.scheduleGames || []).filter(g => Number(g.season) === Number(dynasty.season));
  const unresolved = games.filter(g => g.status !== 'final' || !isValidScore(g.homeScore) || !isValidScore(g.awayScore));
  if (unresolved.length) return `Cannot close Season ${dynasty.season}: ${unresolved.length} game(s) do not have valid final scores.`;
  if (!games.length) return 'Cannot close a season with no recorded games. Add or import the season schedule/results first.';
  const champions = (dynasty.championshipHistory || []).filter(h => Number(h.season) === Number(dynasty.season) && norm(h.champion));
  if (champions.length !== 1) return champions.length ? 'Multiple champion records exist for this season. Resolve the duplicate historical entries before closing.' : 'Cannot close this season until the championship is recorded.';
  return null;
}

module.exports = { auditSeasonSchedule, validateScheduledGame, seasonCloseError, isValidScore };
