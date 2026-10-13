'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditDynastyHistory, summarizeFindings } = require('../utils/historyIntegrity');

function baseDynasty(overrides = {}) {
    return {
        name: 'Test Dynasty',
        coaches: [{ userId: 'coach-1', username: 'Coach One' }],
        coachCareers: {
            'coach-1': [
                { team: 'Alabama', startSeason: 1, endSeason: 3, wins: 30, losses: 8, ties: 0 },
                { team: 'Georgia', startSeason: 4, endSeason: 5, wins: 22, losses: 4, ties: 0 }
            ]
        },
        championshipHistory: [{ season: 2, champion: 'Alabama', runnerUp: 'Georgia' }],
        conferenceChampionsHistory: [{ season: 2, champion: 'Alabama', conference: 'SEC', team: 'Alabama' }],
        heismanHistory: [{ season: 3, winner: 'Player A', team: 'Alabama' }],
        draftHistory: [{ season: 4, player: 'Player B', team: 'Georgia', detail: 'Round 1' }],
        awardHistory: [],
        recordHistory: [],
        ...overrides
    };
}

test('valid history returns no findings', () => {
    assert.deepEqual(auditDynastyHistory(baseDynasty()), []);
});

test('flags duplicate coaching tenure without mutating source records', () => {
    const dynasty = baseDynasty();
    dynasty.coachCareers['coach-1'].push({ ...dynasty.coachCareers['coach-1'][0] });
    const before = JSON.stringify(dynasty);
    const findings = auditDynastyHistory(dynasty);
    assert.ok(findings.some(f => f.code === 'duplicate-tenure' && f.severity === 'error'));
    assert.equal(JSON.stringify(dynasty), before);
});

test('flags invalid tenure record and reversed season range', () => {
    const dynasty = baseDynasty();
    dynasty.coachCareers['coach-1'][0].wins = -2;
    dynasty.coachCareers['coach-1'][1].endSeason = 2;
    const findings = auditDynastyHistory(dynasty);
    assert.ok(findings.some(f => f.code === 'tenure-invalid-record'));
    assert.ok(findings.some(f => f.code === 'tenure-invalid-range'));
});

test('warns about overlapping tenures at different programs', () => {
    const dynasty = baseDynasty();
    dynasty.coachCareers['coach-1'][1].startSeason = 3;
    const findings = auditDynastyHistory(dynasty);
    assert.ok(findings.some(f => f.code === 'overlapping-tenures' && f.severity === 'warning'));
});

test('detects duplicate-looking historical records but does not delete them', () => {
    const dynasty = baseDynasty();
    dynasty.draftHistory.push({ ...dynasty.draftHistory[0] });
    const findings = auditDynastyHistory(dynasty);
    assert.ok(findings.some(f => f.code === 'duplicate-history-record'));
    assert.equal(dynasty.draftHistory.length, 2);
});

test('summarizes errors and warnings', () => {
    assert.deepEqual(summarizeFindings([
        { severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }
    ]), { errors: 1, warnings: 2, total: 3 });
});
