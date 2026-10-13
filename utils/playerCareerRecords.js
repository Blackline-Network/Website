'use strict';

function clean(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function buildPlayerCareerRecords(dynasty = {}) {
  const players = new Map();
  let validRecords = 0;
  const getPlayer = name => {
    const key = clean(name).toLocaleLowerCase();
    if (!key) return null;
    if (!players.has(key)) players.set(key, { name: clean(name), awards: [], heismanSeasons: [], draftSeasons: [], teams: new Set(), seasons: new Set(), milestones: [] });
    return players.get(key);
  };
  const validSeason = row => { const n = Number(row?.season); return Number.isFinite(n) && n >= 1 ? n : null; };
  const addSeason = (player, season) => { if (season !== null) player.seasons.add(season); };
  for (const row of Array.isArray(dynasty.heismanHistory) ? dynasty.heismanHistory : []) {
    const name = clean(row?.winner || row?.player || row?.recipient), season = validSeason(row);
    if (!name || season === null) continue;
    const p = getPlayer(name); validRecords++; p.heismanSeasons.push(season); p.awards.push({ award: 'Heisman Trophy', season }); p.milestones.push({ type: 'Heisman Trophy', season }); addSeason(p, season); if (row.team) p.teams.add(clean(row.team));
  }
  for (const row of Array.isArray(dynasty.awardHistory) ? dynasty.awardHistory : []) {
    const name = clean(row?.winner || row?.player || row?.recipient), season = validSeason(row), award = clean(row?.award || row?.type);
    if (!name || season === null || !award) continue;
    const p = getPlayer(name); validRecords++; p.awards.push({ award, season }); p.milestones.push({ type: award, season }); addSeason(p, season); if (row.team) p.teams.add(clean(row.team));
  }
  for (const row of Array.isArray(dynasty.draftHistory) ? dynasty.draftHistory : []) {
    const name = clean(row?.player || row?.winner || row?.recipient), season = validSeason(row);
    if (!name || season === null) continue;
    const p = getPlayer(name); validRecords++; p.draftSeasons.push(season); p.milestones.push({ type: 'Drafted', season, detail: clean(row.detail) }); addSeason(p, season); if (row.team) p.teams.add(clean(row.team));
  }
  const result = [...players.values()].map(p => ({
    name: p.name, awardCount: p.awards.length, heismanCount: p.heismanSeasons.length, draftCount: p.draftSeasons.length,
    awards: p.awards.sort((a,b) => a.season-b.season || a.award.localeCompare(b.award)),
    heismanSeasons: [...p.heismanSeasons].sort((a,b)=>a-b), draftSeasons: [...p.draftSeasons].sort((a,b)=>a-b),
    seasons: [...p.seasons].sort((a,b)=>a-b), teams: [...p.teams].filter(Boolean).sort(),
    milestones: p.milestones.sort((a,b)=>a.season-b.season || a.type.localeCompare(b.type))
  })).sort((a,b) => b.heismanCount-a.heismanCount || b.awardCount-a.awardCount || b.draftCount-a.draftCount || a.name.localeCompare(b.name));
  return { validRecords, players: result, note: 'Career summaries combine only explicitly recorded Heisman, award, and draft history. They are recognition-history summaries, not statistical career totals; missing seasons, stats, and awards are never inferred.' };
}
module.exports = { buildPlayerCareerRecords };
