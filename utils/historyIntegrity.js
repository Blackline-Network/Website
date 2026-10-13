'use strict';

const TEAM_HISTORY_FIELDS = [
    ['championshipHistory', 'champion'],
    ['conferenceChampionsHistory', 'champion'],
    ['heismanHistory', 'winner'],
    ['draftHistory', 'player'],
    ['awardHistory', 'winner'],
    ['recordHistory', 'winner']
];

function normalize(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function finiteInteger(value) {
    return Number.isInteger(Number(value)) && Number.isFinite(Number(value));
}

function auditDynastyHistory(dynasty) {
    const findings = [];
    const add = (severity, code, message) => findings.push({ severity, code, message });
    const coaches = Array.isArray(dynasty?.coaches) ? dynasty.coaches : [];
    const coachIds = new Set(coaches.map(c => String(c.userId || '')));
    const careers = dynasty?.coachCareers && typeof dynasty.coachCareers === 'object' ? dynasty.coachCareers : {};

    for (const [coachId, entriesRaw] of Object.entries(careers)) {
        const entries = Array.isArray(entriesRaw) ? entriesRaw : [];
        if (!coachIds.has(String(coachId))) {
            add('warning', 'career-coach-not-registered', `Career history references coach ${coachId}, who is not currently registered in this dynasty.`);
        }
        const seenTenures = new Set();
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i] || {};
            const team = normalize(e.team);
            const start = Number(e.startSeason);
            const end = Number(e.endSeason ?? e.startSeason);
            const key = `${team}|${start}`;
            if (!team) add('error', 'tenure-missing-team', `Coach ${coachId}, tenure ${i + 1}: team is missing.`);
            if (!finiteInteger(e.startSeason) || start < 1) add('error', 'tenure-invalid-start', `Coach ${coachId}, tenure ${i + 1}: start season must be a positive integer.`);
            if (!finiteInteger(e.endSeason ?? e.startSeason) || end < 1 || end < start) {
                add('error', 'tenure-invalid-range', `Coach ${coachId}, tenure ${i + 1}: end season must be a valid season at or after the start season.`);
            }
            for (const field of ['wins', 'losses', 'ties']) {
                const n = Number(e[field] ?? 0);
                if (!Number.isInteger(n) || n < 0) add('error', 'tenure-invalid-record', `Coach ${coachId}, ${e.team || 'unknown team'}: ${field} must be a non-negative integer.`);
            }
            if (seenTenures.has(key)) add('error', 'duplicate-tenure', `Coach ${coachId} has duplicate tenure entries for ${e.team || 'unknown team'} beginning in season ${e.startSeason}.`);
            seenTenures.add(key);
        }
        // Overlapping years at different programs are suspicious but may reflect a legitimate mid-season move.
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                const a = entries[i] || {}, b = entries[j] || {};
                if (normalize(a.team) === normalize(b.team)) continue;
                const as = Number(a.startSeason), ae = Number(a.endSeason ?? a.startSeason);
                const bs = Number(b.startSeason), be = Number(b.endSeason ?? b.startSeason);
                if ([as, ae, bs, be].every(Number.isFinite) && as <= be && bs <= ae) {
                    add('warning', 'overlapping-tenures', `Coach ${coachId} has overlapping season ranges at ${a.team || 'unknown team'} (${as}–${ae}) and ${b.team || 'unknown team'} (${bs}–${be}). Confirm the dates are intentional.`);
                }
            }
        }
    }

    for (const [field, identityField] of TEAM_HISTORY_FIELDS) {
        const records = Array.isArray(dynasty?.[field]) ? dynasty[field] : [];
        const seen = new Map();
        records.forEach((r, index) => {
            const season = Number(r?.season);
            if (!Number.isInteger(season) || season < 1) {
                add('error', 'history-invalid-season', `${field} record ${index + 1}: season must be a positive integer.`);
            }
            const identity = normalize(r?.[identityField] || r?.winner || r?.player || r?.champion);
            if (!identity) add('warning', 'history-missing-winner', `${field} record ${index + 1}: winner/player/team is missing.`);
            const team = normalize(r?.team || r?.champion || '');
            const detail = normalize(r?.detail || r?.award || r?.conference || '');
            const key = `${Number.isFinite(season) ? season : 'invalid'}|${identity}|${team}|${detail}`;
            if (seen.has(key)) {
                add('warning', 'duplicate-history-record', `${field} contains duplicate-looking records for season ${r?.season ?? 'unknown'} (${r?.winner || r?.player || r?.champion || 'unnamed'}). Review before removing either entry.`);
            } else seen.set(key, index);
        });
    }

    return findings;
}

function summarizeFindings(findings) {
    return {
        errors: findings.filter(f => f.severity === 'error').length,
        warnings: findings.filter(f => f.severity === 'warning').length,
        total: findings.length
    };
}

module.exports = { auditDynastyHistory, summarizeFindings };
