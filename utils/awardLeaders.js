'use strict';

function buildAwardLeaders(dynasty) {
  const recipients = new Map();
  const categories = new Map();
  const sources = [
    ...(Array.isArray(dynasty?.heismanHistory) ? dynasty.heismanHistory.map(row => ({ ...row, award: 'Heisman Trophy', winner: row.winner || row.player || row.recipient })) : []),
    ...(Array.isArray(dynasty?.awardHistory) ? dynasty.awardHistory.map(row => ({ ...row, award: row.award || row.type || 'Unspecified award', winner: row.winner || row.player || row.recipient })) : [])
  ];
  let validRecords = 0;
  for (const row of sources) {
    const winner = String(row.winner || '').trim();
    const award = String(row.award || '').trim();
    const season = Number(row.season);
    if (!winner || !award || !Number.isFinite(season) || season < 1) continue;
    validRecords++;
    const key = winner.toLocaleLowerCase();
    const person = recipients.get(key) || { name: winner, count: 0, seasons: new Set(), awards: new Set(), teams: new Set() };
    person.count++;
    person.seasons.add(season);
    person.awards.add(award);
    if (row.team) person.teams.add(String(row.team).trim());
    recipients.set(key, person);
    const awardKey = award.toLocaleLowerCase();
    const category = categories.get(awardKey) || { name: award, count: 0, winners: new Set(), seasons: new Set() };
    category.count++;
    category.winners.add(winner);
    category.seasons.add(season);
    categories.set(awardKey, category);
  }
  return {
    validRecords,
    recipientLeaders: [...recipients.values()].map(row => ({ ...row, seasons: [...row.seasons].sort((a,b)=>a-b), awards: [...row.awards].sort(), teams: [...row.teams].sort() })).sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name)),
    awardLeaders: [...categories.values()].map(row => ({ ...row, winners: [...row.winners].sort(), seasons: [...row.seasons].sort((a,b)=>a-b) })).sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name)),
    note: 'Counts include only recorded Heisman and other-award history with a recipient, award category, and valid season. No missing awards are inferred.'
  };
}
module.exports = { buildAwardLeaders };
