'use strict';

const CATEGORIES = [
  { key: 'draftHistory', label: 'Draft', identity: r => r?.player || r?.winner },
  { key: 'heismanHistory', label: 'Heisman', identity: r => r?.winner || r?.player || r?.recipient },
  { key: 'awardHistory', label: 'Award', identity: r => r?.winner || r?.recipient || r?.player },
  { key: 'conferenceChampionsHistory', label: 'Conference title', identity: r => r?.champion || r?.team || r?.winner },
];
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function auditPlayerHistory(dynasty) {
  const findings = [];
  for (const category of CATEGORIES) {
    const rows = Array.isArray(dynasty?.[category.key]) ? dynasty[category.key] : [];
    const seen = new Map();
    rows.forEach((row, index) => {
      const season = Number(row?.season);
      const name = String(category.identity(row) ?? '').trim();
      if (!Number.isInteger(season) || season < 1 || season > 100) {
        findings.push({ severity: 'error', code: 'invalid-season', category: category.label, index, message: `${category.label} record ${index + 1} has an invalid season.` });
      }
      if (!name) findings.push({ severity: 'warning', code: 'missing-player', category: category.label, index, message: `${category.label} record ${index + 1} is missing a player/team name.` });
      if (category.key === 'draftHistory' && !String(row?.team ?? '').trim()) {
        findings.push({ severity: 'warning', code: 'draft-missing-team', category: category.label, index, message: `Draft record ${index + 1} (${name || 'unnamed'}) has no team recorded.` });
      }
      if (name && Number.isInteger(season)) {
        const key = `${season}|${norm(name)}|${norm(row?.team)}|${category.key === 'awardHistory' ? norm(row?.award || row?.type) : ''}|${category.key === 'conferenceChampionsHistory' ? norm(row?.conference) : ''}`;
        if (seen.has(key)) findings.push({ severity: 'warning', code: 'duplicate-record', category: category.label, index, message: `Possible duplicate ${category.label.toLowerCase()} record for Season ${season}: ${name}. Review records ${seen.get(key) + 1} and ${index + 1}.` });
        else seen.set(key, index);
      }
    });
  }
  return { findings, counts: { errors: findings.filter(f => f.severity === 'error').length, warnings: findings.filter(f => f.severity === 'warning').length } };
}

function playerHistoryAuditSummary(audit) {
  if (!audit.findings.length) return 'No player-history integrity issues found.';
  return audit.findings.slice(0, 20).map(f => `${f.severity === 'error' ? '❌' : '⚠️'} ${f.message}`).join('\n');
}

module.exports = { auditPlayerHistory, playerHistoryAuditSummary };
