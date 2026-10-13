'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareSeasonArchive } = require('../utils/seasonTransition');
function base(overrides = {}) { return { season: 3, seasonYear: 2028, seasonArchives: [], championshipHistory: [{ season: 3, champion: 'Alabama', runnerUp: 'Georgia' }], playoffBracket: { season: 3, rounds: [] }, ...overrides }; }
const games = [{ season: 3, status: 'final', homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 24, awayScore: 17 }];
test('prepares a season archive with copied standings and bracket', () => { const d = base(); const standings = [{ team: 'Alabama', wins: 10 }]; const r = prepareSeasonArchive(d, { standings, games, closedAt: '2028-12-01T00:00:00.000Z', closedBy: 'staff' }); assert.equal(r.error, undefined); assert.equal(r.archive.champion, 'Alabama'); assert.equal(r.archive.gameCount, 1); assert.equal(r.archive.completedGames, 1); assert.notEqual(r.archive.standings, standings); assert.notEqual(r.archive.playoffBracket, d.playoffBracket); assert.equal(d.seasonArchives.length, 0); });
test('refuses to overwrite an existing archive for the same season', () => { const prior = { season: 3, champion: 'Georgia', note: 'preserve me' }; const d = base({ seasonArchives: [prior] }); const r = prepareSeasonArchive(d, { games }); assert.match(r.error, /will not overwrite/); assert.equal(d.seasonArchives[0], prior); });
test('requires exactly one recorded champion', () => { const d = base({ championshipHistory: [{ season: 3, champion: 'Alabama' }, { season: 3, champion: 'Georgia' }] }); assert.match(prepareSeasonArchive(d, { games }).error, /exactly one/); });
test('rejects invalid season and missing games without mutation', () => { assert.match(prepareSeasonArchive(base({ season: 0 }), { games }).error, /season number is invalid/); assert.match(prepareSeasonArchive(base(), { games: [] }).error, /no games/); });
