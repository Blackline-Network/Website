'use strict';
const { programNamesFor, normalizeTeam } = require('./programRecords');

function buildProgramEvolution(dynasty, teamName) {
  const key = normalizeTeam(teamName);
  const games = (dynasty.scheduleGames || []).filter(g => g && g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) && (normalizeTeam(g.homeTeam) === key || normalizeTeam(g.awayTeam) === key));
  const seasons = new Map();
  for (const game of games) {
    const season = Number(game.season);
    if (!Number.isFinite(season)) continue;
    if (!seasons.has(season)) seasons.set(season, { season, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: 0 });
    const row = seasons.get(season), home = normalizeTeam(game.homeTeam) === key;
    const scored = Number(home ? game.homeScore : game.awayScore), allowed = Number(home ? game.awayScore : game.homeScore);
    row.games++; row.pf += scored; row.pa += allowed;
    if (scored > allowed) row.wins++; else if (scored < allowed) row.losses++; else row.ties++;
  }
  const titles = (dynasty.championshipHistory || []).filter(r => normalizeTeam(r.champion) === key).map(r => ({ season: Number(r.season), type: 'National Champion', detail: r.runnerUp ? `defeated ${r.runnerUp}` : 'title recorded' }));
  const conferenceTitles = (dynasty.conferenceChampionsHistory || []).filter(r => normalizeTeam(r.champion || r.team || r.winner) === key).map(r => ({ season: Number(r.season), type: 'Conference Champion', detail: r.conference || 'conference title recorded' }));
  const awards = (dynasty.awardHistory || []).filter(r => normalizeTeam(r.team) === key).map(r => ({ season: Number(r.season), type: 'Award', detail: r.award || r.title || r.name || 'team award recorded' }));
  const timeline = [
    ...[...seasons.values()].map(r => ({ season: r.season, type: 'Season Record', detail: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''} · ${r.games} games · ${r.pf-r.pa >= 0 ? '+' : ''}${r.pf-r.pa} point differential` })),
    ...titles, ...conferenceTitles, ...awards
  ].filter(e => Number.isFinite(e.season)).sort((a,b) => b.season-a.season || eventOrder(a.type)-eventOrder(b.type) || a.type.localeCompare(b.type));
  const seasonRows = [...seasons.values()].sort((a,b)=>a.season-b.season);
  let cumulativeWins = 0, cumulativeLosses = 0, cumulativeTies = 0, best = null;
  for (const row of seasonRows) {
    cumulativeWins += row.wins; cumulativeLosses += row.losses; cumulativeTies += row.ties;
    if (!best || row.wins > best.wins || (row.wins === best.wins && row.losses < best.losses)) best = row;
  }
  return {
    team: teamName,
    seasonsReviewed: seasonRows.length,
    gamesReviewed: games.length,
    overall: { wins: cumulativeWins, losses: cumulativeLosses, ties: cumulativeTies },
    bestSeason: best ? { season: best.season, wins: best.wins, losses: best.losses, ties: best.ties, games: best.games } : null,
    nationalTitles: titles.length,
    conferenceTitles: conferenceTitles.length,
    awards: awards.length,
    timeline: timeline.slice(0, 40),
    note: 'Built only from finalized schedule games and explicitly recorded title/award history. Missing seasons, championships, and milestones are not inferred.'
  };
}
function eventOrder(type) { return type === 'National Champion' ? 0 : type === 'Conference Champion' ? 1 : type === 'Award' ? 2 : 3; }
function buildProgramEvolutionIndex(dynasty) { return programNamesFor(dynasty).map(team => buildProgramEvolution(dynasty, team)); }
module.exports = { buildProgramEvolution, buildProgramEvolutionIndex };
