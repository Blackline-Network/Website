const POSITIONS = ['QB','RB','WR','TE','OL','DL','EDGE','LB','CB','S','K','P','ATH','Other'];
const CLASSES = ['FR','SO','JR','SR','RS-FR','RS-SO','RS-JR','RS-SR','GR'];
function identity(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function ensureRosterData(dynasty) {
  if (!Array.isArray(dynasty.rosterPlayers)) dynasty.rosterPlayers = [];
  if (!Array.isArray(dynasty.recruitingProspects)) dynasty.recruitingProspects = [];
}
function validatePlayer(input) {
  if (!input || !String(input.name || '').trim()) return 'Player name is required.';
  if (!String(input.team || '').trim()) return 'Team is required.';
  if (!POSITIONS.includes(input.position)) return 'Choose a valid position.';
  if (!CLASSES.includes(input.classYear)) return 'Choose a valid class year.';
  const number = input.number;
  if (number !== undefined && number !== null && (!Number.isInteger(Number(number)) || Number(number) < 0 || Number(number) > 99)) return 'Jersey number must be an integer from 0 to 99.';
  return null;
}
function upsertPlayer(dynasty, input, actorId) {
  ensureRosterData(dynasty);
  const error = validatePlayer(input); if (error) return { error };
  const name = String(input.name).trim(); const team = String(input.team).trim();
  const existing = dynasty.rosterPlayers.find(p => identity(p.name) === identity(name) && identity(p.team) === identity(team));
  const record = { name, team, position: input.position, classYear: input.classYear, number: input.number === undefined || input.number === null ? null : Number(input.number), hometown: String(input.hometown || '').trim(), updatedAt: new Date().toISOString(), updatedBy: actorId };
  if (existing) Object.assign(existing, record); else dynasty.rosterPlayers.push({ ...record, createdAt: record.updatedAt, createdBy: actorId });
  return { player: existing || dynasty.rosterPlayers[ dynasty.rosterPlayers.length - 1 ], created: !existing };
}
function upsertProspect(dynasty, input, actorId) {
  ensureRosterData(dynasty);
  const name = String(input.name || '').trim(), team = String(input.team || '').trim();
  if (!name || !team) return { error: 'Prospect name and target team are required.' };
  if (!POSITIONS.includes(input.position)) return { error: 'Choose a valid position.' };
  const stars = Number(input.stars); if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: 'Star rating must be between 1 and 5.' };
  const existing = dynasty.recruitingProspects.find(p => identity(p.name) === identity(name) && identity(p.team) === identity(team) && Number(p.season) === Number(input.season));
  const now = new Date().toISOString();
  const status = String(input.status || 'Interested').trim();
  const record = { name, team, position: input.position, stars, season: Number(input.season), status, updatedAt: now, updatedBy: actorId };
  if (existing) {
    const previousStatus = String(existing.status || 'Interested').trim();
    if (!Array.isArray(existing.statusHistory)) existing.statusHistory = [];
    if (identity(previousStatus) !== identity(status)) {
      existing.statusHistory.push({ fromStatus: previousStatus, toStatus: status, at: now, actorId: actorId || null, team, season: Number(input.season) });
    }
    Object.assign(existing, record);
  } else {
    const created = { ...record, createdAt: now, createdBy: actorId, statusHistory: [{ fromStatus: null, toStatus: status, at: now, actorId: actorId || null, team, season: Number(input.season), initial: true }] };
    dynasty.recruitingProspects.push(created);
  }
  return { prospect: existing || dynasty.recruitingProspects[dynasty.recruitingProspects.length - 1], created: !existing };
}
function teamRoster(dynasty, team) { ensureRosterData(dynasty); return dynasty.rosterPlayers.filter(p => identity(p.team) === identity(team)).sort((a,b) => String(a.position).localeCompare(String(b.position)) || String(a.name).localeCompare(String(b.name))); }
function teamProspects(dynasty, team, season = dynasty.season) { ensureRosterData(dynasty); return dynasty.recruitingProspects.filter(p => identity(p.team) === identity(team) && Number(p.season) === Number(season)).sort((a,b) => Number(b.stars)-Number(a.stars) || String(a.name).localeCompare(String(b.name))); }
module.exports = { POSITIONS, CLASSES, ensureRosterData, validatePlayer, upsertPlayer, upsertProspect, teamRoster, teamProspects };
