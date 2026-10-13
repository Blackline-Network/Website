const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayoffClinchingTracker } = require('../utils/playoffClinching');

function league(overrides = {}) {
  return {
    id: 'dynasty-1', name: 'Test Dynasty', season: 3,
    teamSelections: [{ team: 'Alpha' }, { team: 'Bravo' }, { team: 'Charlie' }, { team: 'Delta' }],
    rankings: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
    scheduleGames: [
      { season: 3, week: 1, homeTeam: 'Alpha', awayTeam: 'Bravo', status: 'final', homeScore: 28, awayScore: 14 },
      { season: 3, week: 2, homeTeam: 'Charlie', awayTeam: 'Delta', status: 'final', homeScore: 21, awayScore: 10 }
    ],
    ...overrides
  };
}

test('tracker evaluates one baseline scenario when no games remain and does not mutate league', () => {
  const dynasty = league();
  const before = JSON.stringify(dynasty);
  const result = buildPlayoffClinchingTracker(dynasty, { fieldSize: 2 });
  assert.equal(result.exact, true);
  assert.equal(result.scenariosEvaluated, 1);
  assert.equal(result.remainingGames, 0);
  assert.equal(JSON.stringify(dynasty), before);
  assert.ok(result.clinched.every(row => row.totalScenarios === 1));
});

test('tracker enumerates all three outcomes for one remaining game without saving hypothetical scores', () => {
  const dynasty = league({ scheduleGames: [
    { season: 3, week: 1, homeTeam: 'Alpha', awayTeam: 'Bravo', status: 'scheduled' }
  ] });
  const before = JSON.stringify(dynasty);
  const result = buildPlayoffClinchingTracker(dynasty, { fieldSize: 2 });
  assert.equal(result.exact, true);
  assert.equal(result.scenariosEvaluated, 3);
  assert.equal(result.remainingGames, 1);
  assert.equal(JSON.stringify(dynasty), before);
  assert.ok(Array.isArray(result.bubble));
  assert.ok(Array.isArray(result.eliminated));
});

test('tracker refuses clinching or elimination claims when remaining schedule exceeds enumeration cap', () => {
  const games = Array.from({ length: 9 }, (_, i) => ({ season: 3, week: i + 1, homeTeam: `Team ${i}`, awayTeam: `Team ${i + 10}`, status: 'scheduled' }));
  const result = buildPlayoffClinchingTracker(league({ scheduleGames: games }), { maxEnumeratedGames: 8 });
  assert.equal(result.exact, false);
  assert.equal(result.scenariosEvaluated, 0);
  assert.equal(result.clinched.length, 0);
  assert.equal(result.eliminated.length, 0);
  assert.match(result.note, /no team is labeled clinched or eliminated/i);
});

test('tracker only considers unplayed games from the active season', () => {
  const dynasty = league({ scheduleGames: [
    { season: 2, week: 1, homeTeam: 'Alpha', awayTeam: 'Bravo', status: 'scheduled' },
    { season: 3, week: 1, homeTeam: 'Alpha', awayTeam: 'Bravo', status: 'final', homeScore: 14, awayScore: 10 }
  ] });
  const result = buildPlayoffClinchingTracker(dynasty, { fieldSize: 2 });
  assert.equal(result.remainingGames, 0);
  assert.equal(result.scenariosEvaluated, 1);
});
