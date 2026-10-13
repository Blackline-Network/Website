'use strict';
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const SOURCES = [
  { key: 'heismanHistory', label: 'Heisman', name: r => r.winner || r.player || r.recipient },
  { key: 'awardHistory', label: 'Other award', name: r => r.winner || r.recipient || r.player, detail: r => r.award || r.type || 'Unspecified award' },
  { key: 'draftHistory', label: 'Draft', name: r => r.player || r.winner, detail: r => r.detail || r.round || '' },
  { key: 'conferenceChampionsHistory', label: 'Conference title', name: r => r.champion || r.winner || r.team, detail: r => r.conference || 'Conference unspecified' },
  { key: 'championshipHistory', label: 'National title', name: r => r.champion, detail: r => r.runnerUp ? `runner-up: ${r.runnerUp}` : '' },
  { key: 'recordHistory', label: 'Record / honor', name: r => r.holder || r.recipient || r.winner, detail: r => r.category || r.record || '' },
];
function reviewSeasonAwards(dynasty, season = dynasty?.season) {
  const target = Number(season);
  const entries = [];
  const findings = [];
  const seen = new Map();
  for (const source of SOURCES) {
    const rows = Array.isArray(dynasty?.[source.key]) ? dynasty[source.key] : [];
    rows.forEach((record, index) => {
      if (Number(record?.season) !== target) return;
      const name = String(source.name(record) || '').trim();
      const detail = String(source.detail?.(record) || '').trim();
      const entry = { category: source.label, name, detail, team: String(record.team || record.champion || '').trim(), source: source.key, index };
      entries.push(entry);
      if (!name) findings.push({ code: 'missing-recipient', message: `${source.label} record #${index + 1} is missing its recipient or champion.` });
      const key = [source.key, norm(name), norm(record.team), norm(detail), target].join('|');
      if (name && seen.has(key)) findings.push({ code: 'duplicate', message: `Possible duplicate ${source.label.toLowerCase()} record for ${name} (${detail || 'no detail'}).` });
      else seen.set(key, index);
    });
  }
  const checklist = [
    { label: 'National champion', recorded: entries.some(e => e.source === 'championshipHistory' && e.name) },
    { label: 'Conference champions', recorded: entries.some(e => e.source === 'conferenceChampionsHistory' && e.name) },
    { label: 'Heisman winner', recorded: entries.some(e => e.source === 'heismanHistory' && e.name) },
    { label: 'Other awards', recorded: entries.some(e => e.source === 'awardHistory' && e.name) },
    { label: 'Draft entries', recorded: entries.some(e => e.source === 'draftHistory' && e.name) },
  ];
  return { season: target, entries, findings, checklist, counts: { records: entries.length, errors: findings.filter(f => f.code === 'missing-recipient').length, warnings: findings.filter(f => f.code === 'duplicate').length } };
}
module.exports = { reviewSeasonAwards };
