'use strict';
function norm(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function finalGames(dynasty, season = null) {
  return (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : []).filter(g => g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) && (season === null || Number(g.season) === Number(season)));
}
function calculateAllTimeAnalytics(dynasty) {
  const games = finalGames(dynasty).sort((a,b) => Number(a.season)-Number(b.season) || Number(a.week)-Number(b.week));
  const teams = new Map();
  const get = name => { const key = norm(name); if (!key) return null; if (!teams.has(key)) teams.set(key, { name: String(name).trim(), wins:0, losses:0, ties:0, pf:0, pa:0, games:0, opponents:[] }); return teams.get(key); };
  for (const g of games) {
    const h=get(g.homeTeam), a=get(g.awayTeam); if (!h || !a) continue;
    h.games++; a.games++; h.pf+=g.homeScore; h.pa+=g.awayScore; a.pf+=g.awayScore; a.pa+=g.homeScore; h.opponents.push(a.name); a.opponents.push(h.name);
    if (g.homeScore>g.awayScore) {h.wins++;a.losses++;} else if(g.homeScore<g.awayScore){a.wins++;h.losses++;} else {h.ties++;a.ties++;}
  }
  const pct = r => (r.wins + r.ties*.5) / Math.max(1,r.games);
  const rows = [...teams.values()].map(r => ({...r, winPct:pct(r), strengthOfSchedule:r.opponents.length ? r.opponents.reduce((sum,n)=>sum+(pct(teams.get(norm(n))||{wins:0,losses:0,ties:0,games:0})),0)/r.opponents.length : 0, pointDifferential:r.pf-r.pa, opponentCount:r.opponents.length}));
  return { games:games.length, teams:rows, strengthLeaders:rows.filter(r=>r.opponentCount).sort((a,b)=>b.strengthOfSchedule-a.strengthOfSchedule || b.opponentCount-a.opponentCount || a.name.localeCompare(b.name)) };
}
function calculateConferenceStandings(dynasty, season = dynasty?.season) {
  const confs = dynasty?.teamConferences && !Array.isArray(dynasty.teamConferences) ? dynasty.teamConferences : {};
  const confFor = team => { const key=norm(team); const entry=Object.entries(confs).find(([k])=>norm(k)===key); return entry ? String(entry[1] || '').trim() : ''; };
  const rows = new Map();
  const get = (team, conference) => { const key=`${norm(conference)}::${norm(team)}`; if(!rows.has(key)) rows.set(key,{team,conference,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0,games:0}); return rows.get(key); };
  for(const g of finalGames(dynasty,season)) {
    const hc=confFor(g.homeTeam), ac=confFor(g.awayTeam);
    if(hc && norm(hc)===norm(ac)) {
      const h=get(g.homeTeam,hc), a=get(g.awayTeam,ac); h.games++;a.games++;h.pointsFor+=g.homeScore;h.pointsAgainst+=g.awayScore;a.pointsFor+=g.awayScore;a.pointsAgainst+=g.homeScore;
      if(g.homeScore>g.awayScore){h.wins++;a.losses++;}else if(g.homeScore<g.awayScore){a.wins++;h.losses++;}else{h.ties++;a.ties++;}
    }
  }
  const pct=r=>(r.wins+r.ties*.5)/Math.max(1,r.games);
  return [...rows.values()].sort((a,b)=>norm(a.conference).localeCompare(norm(b.conference)) || pct(b)-pct(a) || (b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst) || a.team.localeCompare(b.team));
}
module.exports = { calculateAllTimeAnalytics, calculateConferenceStandings, finalGames, norm };
