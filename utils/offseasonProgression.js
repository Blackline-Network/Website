const { ensureRosterData, CLASSES } = require('./rosterManagement');

const NEXT_CLASS = { FR: 'SO', SO: 'JR', JR: 'SR', 'RS-FR': 'RS-SO', 'RS-SO': 'RS-JR', 'RS-JR': 'RS-SR' };
const GRADUATING_CLASSES = new Set(['SR', 'RS-SR', 'GR']);
function identity(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function ensureOffseasonData(dynasty) {
  ensureRosterData(dynasty);
  if (!Array.isArray(dynasty.graduatedPlayers)) dynasty.graduatedPlayers = [];
  if (!Array.isArray(dynasty.offseasonTransitions)) dynasty.offseasonTransitions = [];
}
function previewOffseason(dynasty) {
  ensureOffseasonData(dynasty);
  const fromSeason = Number(dynasty.season);
  const roster = dynasty.rosterPlayers;
  const graduating = roster.filter(p => GRADUATING_CLASSES.has(p.classYear));
  const advancing = roster.filter(p => NEXT_CLASS[p.classYear]);
  const unknown = roster.filter(p => !GRADUATING_CLASSES.has(p.classYear) && !NEXT_CLASS[p.classYear] && !CLASSES.includes(p.classYear));
  const nextClassProspects = dynasty.recruitingProspects.filter(p => Number(p.season) === fromSeason + 1 && p.status === 'Signed');
  const duplicateSignings = nextClassProspects.filter((p, i, arr) => arr.findIndex(q => identity(q.name) === identity(p.name) && identity(q.team) === identity(p.team)) !== i);
  const alreadyApplied = dynasty.offseasonTransitions.some(t => Number(t.fromSeason) === fromSeason);
  return { fromSeason, toSeason: fromSeason + 1, rosterCount: roster.length, graduating, advancing, unknown, signedProspects: nextClassProspects, duplicateSignings, alreadyApplied };
}
function applyOffseason(dynasty, actorId) {
  ensureOffseasonData(dynasty);
  if (!dynasty.seasonClosed) return { error: 'Close the current season before applying offseason progression.' };
  const plan = previewOffseason(dynasty);
  if (plan.alreadyApplied) return { error: `Offseason progression for Season ${plan.fromSeason} has already been applied.` };
  if (plan.unknown.length) return { error: `Resolve ${plan.unknown.length} player(s) with an unknown class year before continuing.` };
  if (plan.duplicateSignings.length) return { error: 'Duplicate signed prospect records exist for the next recruiting class. Run the roster audit and resolve them first.' };
  const now = new Date().toISOString();
  const graduates = plan.graduating.map(p => ({ ...p, graduatedAfterSeason: plan.fromSeason, graduatedAt: now, graduatedBy: actorId }));
  dynasty.graduatedPlayers.push(...graduates);
  const graduatingKeys = new Set(plan.graduating.map(p => `${identity(p.name)}|${identity(p.team)}`));
  dynasty.rosterPlayers = dynasty.rosterPlayers.filter(p => !graduatingKeys.has(`${identity(p.name)}|${identity(p.team)}`));
  for (const player of dynasty.rosterPlayers) {
    if (NEXT_CLASS[player.classYear]) player.classYear = NEXT_CLASS[player.classYear];
    player.updatedAt = now;
    player.updatedBy = actorId;
  }
  const recruited = [];
  for (const prospect of plan.signedProspects) {
    const exists = dynasty.rosterPlayers.some(p => identity(p.name) === identity(prospect.name) && identity(p.team) === identity(prospect.team));
    if (exists) { prospect.status = 'Enrolled'; prospect.enrolledInSeason = plan.toSeason; prospect.updatedAt = now; prospect.updatedBy = actorId; continue; }
    const player = { name: prospect.name, team: prospect.team, position: prospect.position, classYear: 'FR', number: null, hometown: '', createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId, recruitedFromSeason: Number(prospect.season), recruitingStars: Number(prospect.stars) };
    dynasty.rosterPlayers.push(player); recruited.push(player);
    prospect.status = 'Enrolled'; prospect.enrolledInSeason = plan.toSeason; prospect.updatedAt = now; prospect.updatedBy = actorId;
  }
  const transition = { fromSeason: plan.fromSeason, toSeason: plan.toSeason, appliedAt: now, appliedBy: actorId, graduated: graduates.length, advanced: plan.advancing.length, enrolled: recruited.length };
  dynasty.offseasonTransitions.push(transition);
  return { transition, graduates, recruited, advanced: plan.advancing.length };
}
module.exports = { NEXT_CLASS, GRADUATING_CLASSES, ensureOffseasonData, previewOffseason, applyOffseason };
