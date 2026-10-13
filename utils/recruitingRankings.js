'use strict';

const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const RECRUITING_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'CB', 'S', 'K', 'P'];
const RECRUITING_STATUSES = ['Interested', 'Offered', 'Visiting', 'Committed', 'Signed'];

/** Current-season pipeline grouped by recorded status and team. Unknown statuses are retained under Other. */
function calculateRecruitingPipeline(dynasty, season = dynasty?.season) {
  const prospects = Array.isArray(dynasty?.recruitingProspects) ? dynasty.recruitingProspects : [];
  const teams = new Map();
  const addTeam = name => {
    const team = String(name || '').trim(); if (!team) return null;
    const key = normalize(team);
    if (!teams.has(key)) teams.set(key, { team, total: 0, statuses: Object.fromEntries([...RECRUITING_STATUSES, 'Other'].map(status => [status, 0])), prospects: [] });
    return teams.get(key);
  };
  for (const team of (dynasty?.teams || [])) addTeam(typeof team === 'string' ? team : team?.name || team?.team);
  for (const selection of (dynasty?.teamSelections || [])) addTeam(selection?.team);
  for (const prospect of prospects) {
    if (!prospect || Number(prospect.season) !== Number(season)) continue;
    const entry = addTeam(prospect.team);
    const name = String(prospect.name || '').trim(); if (!entry || !name) continue;
    const canonical = RECRUITING_STATUSES.find(status => normalize(status) === normalize(prospect.status)) || 'Other';
    entry.total += 1; entry.statuses[canonical] += 1;
    entry.prospects.push({ name, position: String(prospect.position || '—'), stars: Number.isInteger(Number(prospect.stars)) ? Number(prospect.stars) : null, status: canonical });
  }
  return [...teams.values()].map(entry => ({ ...entry, prospects: entry.prospects.sort((a,b) => (b.stars || 0) - (a.stars || 0) || a.name.localeCompare(b.name)) }))
    .sort((a,b) => b.statuses.Committed - a.statuses.Committed || b.statuses.Signed - a.statuses.Signed || b.total - a.total || a.team.localeCompare(b.team));
}

/**
 * Ranks recruiting classes from recorded Signed prospects only. No ratings or
 * commitments are inferred. A class score is the sum of recorded star ratings.
 */
function calculateRecruitingRankings(dynasty, season = dynasty?.season) {
  const prospects = Array.isArray(dynasty?.recruitingProspects) ? dynasty.recruitingProspects : [];
  const byTeam = new Map();
  for (const prospect of prospects) {
    if (!prospect || Number(prospect.season) !== Number(season) || normalize(prospect.status) !== 'signed') continue;
    const team = String(prospect.team || '').trim();
    const name = String(prospect.name || '').trim();
    const stars = Number(prospect.stars);
    if (!team || !name || !Number.isInteger(stars) || stars < 1 || stars > 5) continue;
    const key = normalize(team);
    if (!byTeam.has(key)) byTeam.set(key, { team, signed: 0, starPoints: 0, prospects: [] });
    const entry = byTeam.get(key);
    entry.signed += 1;
    entry.starPoints += stars;
    entry.prospects.push({ name, position: String(prospect.position || '—'), stars });
  }
  return [...byTeam.values()]
    .map(entry => ({ ...entry, averageStars: entry.starPoints / entry.signed }))
    .sort((a, b) => b.starPoints - a.starPoints || b.signed - a.signed || b.averageStars - a.averageStars || a.team.localeCompare(b.team));
}

/**
 * Builds a transparent roster-coverage snapshot. Thin = 0-2 recorded players,
 * Moderate = 3-5, Deep = 6+. Signed prospects are shown separately and do not
 * count as rostered players until the existing offseason promotion runs.
 */
function calculatePositionNeeds(dynasty, season = dynasty?.season) {
  const roster = Array.isArray(dynasty?.rosterPlayers) ? dynasty.rosterPlayers : [];
  const prospects = Array.isArray(dynasty?.recruitingProspects) ? dynasty.recruitingProspects : [];
  const teams = new Map();
  const addTeam = name => {
    const team = String(name || '').trim();
    if (!team) return null;
    const key = normalize(team);
    if (!teams.has(key)) teams.set(key, { team, positions: {} });
    return teams.get(key);
  };
  for (const team of (dynasty?.teams || [])) addTeam(typeof team === 'string' ? team : team?.name || team?.team);
  for (const selection of (dynasty?.teamSelections || [])) addTeam(selection?.team);
  for (const player of roster) addTeam(player?.team);
  for (const prospect of prospects) addTeam(prospect?.team);
  const signedByTeamPosition = new Map();
  for (const prospect of prospects) {
    if (Number(prospect?.season) !== Number(season) || normalize(prospect?.status) !== 'signed') continue;
    const key = `${normalize(prospect.team)}|${String(prospect.position || 'Other').toUpperCase()}`;
    signedByTeamPosition.set(key, (signedByTeamPosition.get(key) || 0) + 1);
  }
  for (const entry of teams.values()) {
    for (const position of RECRUITING_POSITIONS) {
      const rosterCount = roster.filter(p => normalize(p?.team) === normalize(entry.team) && String(p?.position || '').toUpperCase() === position).length;
      const signedCount = signedByTeamPosition.get(`${normalize(entry.team)}|${position}`) || 0;
      entry.positions[position] = {
        position, rosterCount, signedCount,
        depth: rosterCount <= 2 ? 'Thin' : rosterCount <= 5 ? 'Moderate' : 'Deep',
        priority: rosterCount <= 2 && signedCount === 0 ? 'High' : rosterCount <= 2 ? 'Addressed by signed class' : 'Monitor'
      };
    }
    entry.highNeeds = RECRUITING_POSITIONS.map(position => entry.positions[position]).filter(item => item.priority === 'High');
    entry.signedTotal = Object.values(entry.positions).reduce((sum, item) => sum + item.signedCount, 0);
  }
  return [...teams.values()].sort((a, b) => a.team.localeCompare(b.team));
}

/** Historical recruiting class archive from explicitly saved prospect records. */
function buildRecruitingClassArchive(dynasty, { limit = 12, team = null } = {}) {
  const prospects = Array.isArray(dynasty?.recruitingProspects) ? dynasty.recruitingProspects : [];
  const teamKey = team ? normalize(team) : null;
  const seasons = new Map();
  for (const prospect of prospects) {
    if (!prospect || !Number.isInteger(Number(prospect.season)) || Number(prospect.season) < 0) continue;
    const name = String(prospect.name || '').trim();
    const teamName = String(prospect.team || '').trim();
    if (!name || !teamName || (teamKey && normalize(teamName) !== teamKey)) continue;
    const season = Number(prospect.season);
    if (!seasons.has(season)) seasons.set(season, new Map());
    const byTeam = seasons.get(season);
    const key = normalize(teamName);
    if (!byTeam.has(key)) byTeam.set(key, { team: teamName, prospects: 0, signed: 0, committed: 0, starPoints: 0, ratedSigned: 0, positions: {} });
    const row = byTeam.get(key);
    row.prospects += 1;
    const status = normalize(prospect.status);
    if (status === 'signed') {
      row.signed += 1;
      const stars = Number(prospect.stars);
      if (Number.isInteger(stars) && stars >= 1 && stars <= 5) { row.starPoints += stars; row.ratedSigned += 1; }
    }
    if (status === 'committed') row.committed += 1;
    const position = String(prospect.position || 'Other').trim().toUpperCase() || 'OTHER';
    row.positions[position] = (row.positions[position] || 0) + (status === 'signed' ? 1 : 0);
  }
  const archive = [...seasons.entries()].sort((a,b) => b[0] - a[0]).map(([season, byTeam]) => {
    const teams = [...byTeam.values()].map(row => ({
      ...row,
      averageStars: row.ratedSigned ? row.starPoints / row.ratedSigned : null,
      positions: Object.fromEntries(Object.entries(row.positions).filter(([, count]) => count > 0).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])))
    })).sort((a,b) => b.starPoints-a.starPoints || b.signed-a.signed || a.team.localeCompare(b.team));
    return { season, teams, prospectCount: teams.reduce((sum,row)=>sum+row.prospects,0), signed: teams.reduce((sum,row)=>sum+row.signed,0) };
  });
  const max = Math.max(1, Math.min(30, Number(limit) || 12));
  return { seasons: archive.slice(0, max), totalSeasons: archive.length, team: team || null };
}

module.exports = { calculateRecruitingRankings, calculatePositionNeeds, calculateRecruitingPipeline, buildRecruitingClassArchive, RECRUITING_POSITIONS, RECRUITING_STATUSES };
