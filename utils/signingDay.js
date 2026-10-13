'use strict';

const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** Builds signing-day recaps only from explicit Signed prospect records. */
function buildSigningDayRecap(dynasty, season = dynasty?.season) {
  const prospects = Array.isArray(dynasty?.recruitingProspects) ? dynasty.recruitingProspects : [];
  const teams = new Map();
  const seasons = new Set();
  for (const prospect of prospects) {
    if (!prospect || normalize(prospect.status) !== 'signed') continue;
    const signedSeason = Number(prospect.season);
    const team = String(prospect.team || '').trim();
    const name = String(prospect.name || '').trim();
    const stars = Number(prospect.stars);
    if (!Number.isInteger(signedSeason) || signedSeason < 1 || !team || !name) continue;
    seasons.add(signedSeason);
    if (signedSeason !== Number(season)) continue;
    const key = normalize(team);
    if (!teams.has(key)) teams.set(key, { team, count: 0, starPoints: 0, prospects: [] });
    const entry = teams.get(key);
    const validStars = Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null;
    entry.count += 1;
    if (validStars) entry.starPoints += validStars;
    const position = String(prospect.position || '—').trim() || '—';
    entry.prospects.push({ name, position, stars: validStars });
  }
  const rankedTeams = [...teams.values()].map(entry => ({
    ...entry,
    averageStars: entry.prospects.filter(p => p.stars !== null).length
      ? entry.starPoints / entry.prospects.filter(p => p.stars !== null).length : null,
    prospects: entry.prospects.sort((a, b) => (b.stars || 0) - (a.stars || 0) || a.name.localeCompare(b.name)),
    positionCounts: entry.prospects.reduce((counts, prospect) => {
      const position = prospect.position.toLocaleUpperCase();
      counts[position] = (counts[position] || 0) + 1;
      return counts;
    }, {}),
    starDistribution: entry.prospects.reduce((counts, prospect) => {
      if (prospect.stars !== null) counts[prospect.stars] = (counts[prospect.stars] || 0) + 1;
      return counts;
    }, {}),
    topProspect: entry.prospects.filter(prospect => prospect.stars !== null)
      .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))[0] || null
  })).sort((a, b) => b.starPoints - a.starPoints || b.count - a.count || a.team.localeCompare(b.team));
  const seasonTotals = [...seasons].sort((a, b) => b - a).map(year => ({
    season: year,
    signed: prospects.filter(p => Number(p?.season) === year && normalize(p?.status) === 'signed' && String(p?.name || '').trim() && String(p?.team || '').trim()).length,
    teams: new Set(prospects.filter(p => Number(p?.season) === year && normalize(p?.status) === 'signed' && String(p?.team || '').trim()).map(p => normalize(p.team))).size
  }));
  return { season: Number(season), teams: rankedTeams, signedCount: rankedTeams.reduce((sum, row) => sum + row.count, 0), seasonTotals };
}

module.exports = { buildSigningDayRecap };
