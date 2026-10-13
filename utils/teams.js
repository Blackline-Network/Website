const NCAA27_TEAMS = [
  'Boston College','California','Clemson','Duke','Florida State','Georgia Tech','Louisville','Miami','NC State','North Carolina','Pittsburgh','SMU','Stanford','Syracuse','Virginia','Virginia Tech','Wake Forest',
  'Army','Charlotte','East Carolina','Florida Atlantic','Memphis','Navy','North Texas','Rice','Temple','Tulane','Tulsa','UAB','USF','UTSA',
  'Arizona','Arizona State','Baylor','BYU','Cincinnati','Colorado','Houston','Iowa State','Kansas','Kansas State','Oklahoma State','TCU','Texas Tech','UCF','Utah','West Virginia',
  'Illinois','Indiana','Iowa','Maryland','Michigan','Michigan State','Minnesota','Nebraska','Northwestern','Ohio State','Oregon','Penn State','Purdue','Rutgers','UCLA','USC','Washington','Wisconsin',
  'Delaware','Florida International','Jacksonville State','Kennesaw State','Liberty','Middle Tennessee','Missouri State','New Mexico State','Sam Houston','Western Kentucky',
  'Notre Dame','UConn',
  'Akron','Ball State','Bowling Green','Buffalo','Central Michigan','Eastern Michigan','Kent State','Miami University','Ohio','Sacramento State','Toledo','UMass','Western Michigan',
  'Air Force','Hawai\'i','Nevada','New Mexico','North Dakota State','Northern Illinois','San Jose State','UNLV','UTEP','Wyoming',
  'Boise State','Colorado State','Fresno State','Oregon State','San Diego State','Texas State','Utah State','Washington State',
  'Alabama','Arkansas','Auburn','Florida','Georgia','Kentucky','LSU','Mississippi State','Missouri','Oklahoma','Ole Miss','South Carolina','Tennessee','Texas','Texas A&M','Vanderbilt',
  'Appalachian State','Arkansas State','Coastal Carolina','Georgia Southern','Georgia State','James Madison','Louisiana','Louisiana Tech','Marshall','Old Dominion','South Alabama','Southern Mississippi','Troy','UL Monroe'
];

function getTeamsForDynasty(dynasty) {
  // Always present teams alphabetically so the status list and Discord selection menu
  // use the same predictable order.
  const teams = ((dynasty?.game || '').toLowerCase() === 'ncaa')
    ? NCAA27_TEAMS
    : (Array.isArray(dynasty?.teamPool) && dynasty.teamPool.length ? dynasty.teamPool : NCAA27_TEAMS);
  return [...teams].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function getTeamEmoji(dynasty, team) {
  return dynasty?.teamEmojis?.[team] || '🏈';
}

function parseDiscordEmoji(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const custom = raw.match(/^<a?:([\w~]+):(\d+)>$/);
  if (custom) return { name: custom[1], id: custom[2], animated: raw.startsWith('<a:') };
  const idOnly = raw.match(/^(\d{15,25})$/);
  if (idOnly) return { id: idOnly[1] };
  const named = raw.match(/^:([\w~]+):$/);
  if (named) return { name: named[1] };
  return null;
}

function resolveGuildEmoji(guild, value) {
  const parsed = parseDiscordEmoji(value);
  if (!parsed) return null;

  // Prefer a real emoji from this server when available.
  if (guild && parsed.id) {
    const emoji = guild.emojis.cache.get(parsed.id);
    if (emoji) return { id: emoji.id, name: emoji.name, animated: emoji.animated, external: false };
  }
  if (guild && parsed.name) {
    const emoji = guild.emojis.cache.find(e => e.name === parsed.name);
    if (emoji) return { id: emoji.id, name: emoji.name, animated: emoji.animated, external: false };
  }

  // Discord can use an external custom emoji when the bot/message has access
  // to that emoji. Keep the supplied name + ID instead of rejecting it simply
  // because it belongs to another server. Users may still need Nitro and the
  // destination server must allow external emojis.
  if (parsed.id && parsed.name) {
    return { id: parsed.id, name: parsed.name, animated: !!parsed.animated, external: true };
  }

  return null;
}

function normalizeTeamKey(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function getTeamSelections(dynasty) {
  if (!Array.isArray(dynasty.teamSelections)) dynasty.teamSelections = [];
  return dynasty.teamSelections;
}

function getTakenTeam(dynasty, team) {
  const key = normalizeTeamKey(team);
  return getTeamSelections(dynasty).find(selection => normalizeTeamKey(selection.team) === key);
}

function getCoachTeam(dynasty, userId) {
  return getTeamSelections(dynasty).find(selection => String(selection.userId) === String(userId));
}

function isTeamAvailable(dynasty, team) {
  return !getTakenTeam(dynasty, team);
}

function claimTeam(dynasty, team, user) {
  const teams = getTeamsForDynasty(dynasty);
  const key = normalizeTeamKey(team);
  const canonicalTeam = teams.find(candidate => normalizeTeamKey(candidate) === key);
  if (!canonicalTeam) return { success: false, reason: 'invalid_team' };
  if (!user?.id) return { success: false, reason: 'invalid_user' };
  const existing = getCoachTeam(dynasty, user.id);
  if (existing) return { success: false, reason: 'already_has_team', team: existing.team };
  const taken = getTakenTeam(dynasty, canonicalTeam);
  if (taken) return { success: false, reason: 'taken', userId: taken.userId };
  dynasty.teamSelections.push({ team: canonicalTeam, userId: String(user.id), username: user.tag || user.username || String(user.id), selectedAt: new Date().toISOString() });
  return { success: true };
}

function releaseTeam(dynasty, team) {
  const before = getTeamSelections(dynasty).length;
  const key = normalizeTeamKey(team);
  dynasty.teamSelections = getTeamSelections(dynasty).filter(selection => normalizeTeamKey(selection.team) !== key);
  return dynasty.teamSelections.length !== before;
}

module.exports = { NCAA27_TEAMS, normalizeTeamKey, getTeamsForDynasty, getTeamEmoji, parseDiscordEmoji, resolveGuildEmoji, getTeamSelections, getTakenTeam, getCoachTeam, isTeamAvailable, claimTeam, releaseTeam };
