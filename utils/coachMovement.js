'use strict';

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Build a chronological, read-only job history from explicitly recorded tenures. */
function buildCoachMovementHistory(dynasty, userId) {
  const raw = Array.isArray(dynasty?.coachCareers?.[userId]) ? dynasty.coachCareers[userId] : [];
  const seen = new Set();
  const tenures = raw.map(entry => {
    const team = String(entry?.team || '').trim().replace(/\s+/g, ' ');
    const startSeason = Number(entry?.startSeason);
    const endSeason = Number(entry?.endSeason ?? entry?.startSeason);
    const wins = Number(entry?.wins);
    const losses = Number(entry?.losses);
    const ties = Number(entry?.ties || 0);
    if (!team || !Number.isInteger(startSeason) || startSeason < 1 || !Number.isInteger(endSeason) || endSeason < startSeason) return null;
    const key = `${normalize(team)}|${startSeason}|${endSeason}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return { team, startSeason, endSeason, wins: Number.isFinite(wins) && wins >= 0 ? wins : null,
      losses: Number.isFinite(losses) && losses >= 0 ? losses : null,
      ties: Number.isFinite(ties) && ties >= 0 ? ties : 0 };
  }).filter(Boolean).sort((a,b) => a.startSeason - b.startSeason || a.endSeason - b.endSeason || a.team.localeCompare(b.team));
  const transitions = tenures.slice(1).map((current, index) => {
    const previous = tenures[index];
    return { from: previous.team, to: current.team, afterSeason: previous.endSeason,
      startSeason: current.startSeason, overlap: current.startSeason <= previous.endSeason,
      sameProgram: normalize(previous.team) === normalize(current.team) };
  }).filter(move => !move.sameProgram);
  const overlapping = [];
  for (let i=0;i<tenures.length;i++) for(let j=i+1;j<tenures.length;j++) {
    if (tenures[j].startSeason > tenures[i].endSeason) break;
    if (normalize(tenures[i].team) !== normalize(tenures[j].team)) overlapping.push({ first: tenures[i].team, second: tenures[j].team,
      startSeason: Math.max(tenures[i].startSeason, tenures[j].startSeason), endSeason: Math.min(tenures[i].endSeason, tenures[j].endSeason) });
  }
  return { tenures, transitions, overlapping, totalPrograms: new Set(tenures.map(t => normalize(t.team))).size,
    note: 'Based only on staff-recorded coaching tenures. Season ranges do not establish exact hiring dates; overlapping tenures are flagged rather than resolved.' };
}

module.exports = { buildCoachMovementHistory, normalizeCoachMovementTeam: normalize };
