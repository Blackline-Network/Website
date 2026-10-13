'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayoffHistory, getBracketRows } = require('../utils/playoffHistory');

function bracket(season, games, champion = null) {
  return { season, status: champion ? 'complete' : 'in progress', champion, size: 4,
    rounds: [{ round: 1, name: 'Semifinal', games: games.map(([homeTeam, awayTeam, homeScore, awayScore]) => ({
      homeTeam, awayTeam, status: Number.isFinite(homeScore) && Number.isFinite(awayScore) ? 'final' : 'scheduled',
      ...(Number.isFinite(homeScore) ? { homeScore, awayScore, winner: homeScore > awayScore ? homeTeam : awayTeam } : {})
    })) }] };
}
function dynasty(overrides = {}) {
  return { name: 'Test League', season: 3, playoffBracket: bracket(3, [['Alpha', 'Bravo', null, null]]),
    seasonArchives: [
      { season: 1, champion: 'Alpha', playoffBracket: bracket(1, [['Alpha', 'Bravo', 31, 21], ['Charlie', 'Delta', 20, 17], ['Alpha', 'Charlie', 28, 24]], 'Alpha') },
      { season: 2, champion: 'Bravo', playoffBracket: bracket(2, [['Bravo', 'Alpha', 24, 14], ['Charlie', 'Delta', 17, 10], ['Bravo', 'Charlie', 21, 20]], 'Bravo') }
    ], ...overrides };
}

test('history combines archived and current brackets without duplicate seasons', () => {
  const result = buildPlayoffHistory(dynasty());
  assert.deepEqual(result.seasons.map(row => row.season), [3, 2, 1]);
  assert.equal(result.bracketsAvailable, 3);
  assert.equal(result.seasons[0].finalizedGames, 0);
});

test('current bracket rematches reference the seasons where the teams met before', () => {
  const result = buildPlayoffHistory(dynasty());
  assert.equal(result.rematches.length, 1);
  assert.deepEqual(result.rematches[0].previousSeasons, [2, 1]);
  assert.equal(result.rematches[0].homeTeam, 'Alpha');
});

test('repeat series list contains only pairs appearing in at least two bracket seasons', () => {
  const result = buildPlayoffHistory(dynasty());
  const alphaBravo = result.repeatSeries.find(row => row.teams.some(team => team.toLowerCase() === 'alpha') && row.teams.some(team => team.toLowerCase() === 'bravo'));
  assert.equal(alphaBravo.meetings, 3);
  assert.deepEqual(alphaBravo.seasons, [3, 2, 1]);
});

test('unfinalized and malformed bracket games are not shown as finalized scores', () => {
  const league = dynasty({ seasonArchives: [], playoffBracket: bracket(3, [['Alpha', 'Bravo', 21, 21], ['Charlie', 'Delta', null, null]]) });
  const result = buildPlayoffHistory(league);
  assert.equal(result.matchups.length, 0);
  assert.equal(result.totalMatchups, 2);
});

test('missing brackets do not fabricate a history from championship records', () => {
  const result = buildPlayoffHistory({ season: 5, playoffBracket: null, seasonArchives: [], championshipHistory: [{ season: 4, champion: 'Alpha' }] });
  assert.equal(result.bracketsAvailable, 0);
  assert.equal(result.totalMatchups, 0);
  assert.match(result.note, /do not contain enough detail/i);
});

test('current bracket takes precedence over an archive copy of the same season', () => {
  const league = dynasty({ seasonArchives: [{ season: 3, playoffBracket: bracket(3, [['Old', 'Pair', 30, 20]]) }] });
  const rows = getBracketRows(league);
  assert.equal(rows.filter(row => row.season === 3).length, 1);
  assert.equal(rows.find(row => row.season === 3).bracket.rounds[0].games[0].homeTeam, 'Alpha');
});
