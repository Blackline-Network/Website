'use strict';
function normalizeTeam(name) { return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function programNamesFor(dynasty) {
    const names = new Map();
    const add = value => { const name = String(value || '').trim(); if (name && name.toLowerCase() !== 'n/a') names.set(normalizeTeam(name), names.get(normalizeTeam(name)) || name); };
    for (const selection of dynasty.teamSelections || []) add(selection.team);
    for (const game of dynasty.scheduleGames || []) { add(game.homeTeam); add(game.awayTeam); }
    for (const row of dynasty.championshipHistory || []) add(row.champion);
    for (const row of dynasty.conferenceChampionsHistory || []) add(row.champion || row.team || row.winner);
    for (const row of Object.values(dynasty.coachCareers || {}).flat()) add(row?.team);
    for (const row of dynasty.heismanHistory || []) add(row?.team);
    for (const row of dynasty.draftHistory || []) add(row?.team);
    for (const row of dynasty.awardHistory || []) add(row?.team);
    return [...names.values()].sort((a, b) => a.localeCompare(b));
}
function calculateProgramProfile(dynasty, teamName) {
    const key = normalizeTeam(teamName);
    const games = (dynasty.scheduleGames || []).filter(g => g.status === 'final' && Number.isFinite(g.homeScore) && Number.isFinite(g.awayScore) &&
        (normalizeTeam(g.homeTeam) === key || normalizeTeam(g.awayTeam) === key))
        .sort((a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week));
    const record = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, seasons: new Map() };
    for (const g of games) {
        const home = normalizeTeam(g.homeTeam) === key;
        const scored = Number(home ? g.homeScore : g.awayScore), allowed = Number(home ? g.awayScore : g.homeScore);
        record.pf += scored; record.pa += allowed;
        if (scored > allowed) record.wins++; else if (scored < allowed) record.losses++; else record.ties++;
        const season = Number(g.season);
        if (!record.seasons.has(season)) record.seasons.set(season, { wins: 0, losses: 0, ties: 0, games: 0 });
        const sr = record.seasons.get(season); sr.games++;
        if (scored > allowed) sr.wins++; else if (scored < allowed) sr.losses++; else sr.ties++;
    }
    return {
        teamName, games, record,
        titles: (dynasty.championshipHistory || []).filter(r => normalizeTeam(r.champion) === key),
        conferenceTitles: (dynasty.conferenceChampionsHistory || []).filter(r => normalizeTeam(r.champion || r.team || r.winner) === key),
        heismans: (dynasty.heismanHistory || []).filter(r => normalizeTeam(r.team) === key),
        draftPicks: (dynasty.draftHistory || []).filter(r => normalizeTeam(r.team) === key),
        awards: (dynasty.awardHistory || []).filter(r => normalizeTeam(r.team) === key),
        careers: Object.entries(dynasty.coachCareers || {}).flatMap(([userId, entries]) => (Array.isArray(entries) ? entries : [])
            .filter(e => normalizeTeam(e.team) === key).map(e => ({ userId, ...e })))
            .sort((a, b) => Number(a.startSeason) - Number(b.startSeason))
    };
}
module.exports = { programNamesFor, calculateProgramProfile, normalizeTeam };
