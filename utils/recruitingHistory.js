'use strict';

const { ensureRosterData } = require('./rosterManagement');

function buildRecruitingHistory(dynasty, { season = dynasty.season, limit = 15, team = null } = {}) {
  ensureRosterData(dynasty);
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const events = [];
  for (const prospect of dynasty.recruitingProspects) {
    if (Number(prospect.season) !== Number(season)) continue;
    if (team && normalize(prospect.team) !== normalize(team)) continue;
    for (const event of Array.isArray(prospect.statusHistory) ? prospect.statusHistory : []) {
      const at = event.at && Number.isFinite(new Date(event.at).getTime()) ? new Date(event.at).toISOString() : null;
      events.push({
        prospect: String(prospect.name || 'Unknown prospect'),
        team: String(event.team || prospect.team || 'Unknown team'),
        position: String(prospect.position || 'N/A'),
        stars: Number(prospect.stars) || 0,
        season: Number(event.season || prospect.season),
        fromStatus: event.fromStatus || null,
        toStatus: String(event.toStatus || prospect.status || 'Unknown'),
        at,
        actorId: event.actorId || null,
        initial: Boolean(event.initial)
      });
    }
  }
  events.sort((a, b) => {
    if (a.at && b.at) return b.at.localeCompare(a.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return b.prospect.localeCompare(a.prospect);
  });
  const max = Math.max(1, Math.min(25, Number(limit) || 15));
  return { season: Number(season), items: events.slice(0, max), total: events.length, hasOlderUntrackedRecords: dynasty.recruitingProspects.some(p => Number(p.season) === Number(season) && !Array.isArray(p.statusHistory)) };
}

module.exports = { buildRecruitingHistory };
