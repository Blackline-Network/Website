const { ensureRosterData, POSITIONS } = require('./rosterManagement');

const FOCUSES = ['General', 'Offense', 'Defense', 'Special Teams'];
const OFFENSE = new Set(['QB', 'RB', 'WR', 'TE', 'OL']);
const DEFENSE = new Set(['DL', 'EDGE', 'LB', 'CB', 'S']);
const SPECIAL = new Set(['K', 'P']);
function identity(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function focusForPosition(position) {
  if (OFFENSE.has(position)) return 'Offense';
  if (DEFENSE.has(position)) return 'Defense';
  if (SPECIAL.has(position)) return 'Special Teams';
  return 'General';
}
function validateRatings(overall, potential) {
  if (!Number.isInteger(Number(overall)) || Number(overall) < 40 || Number(overall) > 99) return 'Overall rating must be a whole number from 40 to 99.';
  if (!Number.isInteger(Number(potential)) || Number(potential) < 40 || Number(potential) > 99) return 'Potential must be a whole number from 40 to 99.';
  if (Number(potential) < Number(overall)) return 'Potential cannot be lower than the current overall rating.';
  return null;
}
function setPlayerDevelopment(dynasty, { name, team, overall, potential, focus = 'General' }, actorId) {
  ensureRosterData(dynasty);
  const player = dynasty.rosterPlayers.find(p => identity(p.name) === identity(name) && identity(p.team) === identity(team));
  if (!player) return { error: `Could not find ${name} on ${team}'s roster.` };
  const error = validateRatings(overall, potential); if (error) return { error };
  if (!FOCUSES.includes(focus)) return { error: 'Choose a valid development focus.' };
  player.development = { overall: Number(overall), potential: Number(potential), focus, updatedAt: new Date().toISOString(), updatedBy: actorId };
  return { player };
}
function ensureDevelopmentData(dynasty) {
  ensureRosterData(dynasty);
  if (!Array.isArray(dynasty.playerDevelopmentHistory)) dynasty.playerDevelopmentHistory = [];
  if (!Array.isArray(dynasty.developmentTransitions)) dynasty.developmentTransitions = [];
}
function previewDevelopment(dynasty) {
  ensureDevelopmentData(dynasty);
  const season = Number(dynasty.season);
  const alreadyApplied = dynasty.developmentTransitions.some(t => Number(t.season) === season);
  const rated = dynasty.rosterPlayers.filter(p => p.development && Number.isInteger(Number(p.development.overall)) && Number.isInteger(Number(p.development.potential)));
  const players = rated.map(p => {
    const overall = Number(p.development.overall), potential = Number(p.development.potential);
    const focus = FOCUSES.includes(p.development.focus) ? p.development.focus : 'General';
    const matchedFocus = focus === 'General' || focus === focusForPosition(p.position);
    const gain = Math.min(Math.max(0, potential - overall), (potential - overall >= 10 ? 2 : 1) + (matchedFocus && focus !== 'General' ? 1 : 0));
    return { name: p.name, team: p.team, position: p.position, overall, potential, focus, gain, newOverall: overall + gain };
  });
  return { season, alreadyApplied, players, unrated: dynasty.rosterPlayers.filter(p => !p.development).length, totalGain: players.reduce((sum, p) => sum + p.gain, 0) };
}
function applyDevelopment(dynasty, actorId) {
  ensureDevelopmentData(dynasty);
  if (!dynasty.seasonClosed) return { error: 'Close the current season before applying player development.' };
  const plan = previewDevelopment(dynasty);
  if (plan.alreadyApplied) return { error: `Player development for Season ${plan.season} has already been applied.` };
  const now = new Date().toISOString();
  const changed = [];
  for (const item of plan.players) {
    if (!item.gain) continue;
    const player = dynasty.rosterPlayers.find(p => identity(p.name) === identity(item.name) && identity(p.team) === identity(item.team));
    if (!player || !player.development || Number(player.development.overall) !== item.overall) continue;
    player.development.overall = item.newOverall;
    player.development.updatedAt = now;
    player.development.updatedBy = actorId;
    const history = { season: plan.season, name: player.name, team: player.team, position: player.position, fromOverall: item.overall, toOverall: item.newOverall, potential: item.potential, focus: item.focus, appliedAt: now, appliedBy: actorId };
    dynasty.playerDevelopmentHistory.push(history); changed.push(history);
  }
  const transition = { season: plan.season, appliedAt: now, appliedBy: actorId, playersImproved: changed.length, totalPointsGained: changed.reduce((sum, p) => sum + p.toOverall - p.fromOverall, 0) };
  dynasty.developmentTransitions.push(transition);
  return { transition, changed, unrated: plan.unrated };
}
module.exports = { FOCUSES, validateRatings, setPlayerDevelopment, previewDevelopment, applyDevelopment, focusForPosition };
