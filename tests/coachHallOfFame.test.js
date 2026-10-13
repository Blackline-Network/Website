'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoachHallOfFame } = require('../utils/coachHallOfFame');

function sample() {
  return { coaches: [
    { userId: '1', username: 'Coach Champion' },
    { userId: '2', username: 'Rising Coach' },
    { userId: '1', username: 'Duplicate registration' },
    { username: 'Missing ID' }
  ] };
}

test('coach Hall of Fame ranks registered coaches by the existing legacy score', () => {
  const result = buildCoachHallOfFame(sample(), { getCareerStats: id => id === '1'
    ? { wins: 100, losses: 20, titles: 2, conferenceTitles: 3, heismanWinners: 1, draftedPlayers: 12, entries: [{ startSeason: 1, endSeason: 8 }] }
    : { wins: 4, losses: 6 } });
  assert.equal(result.coachesReviewed, 2);
  assert.equal(result.coaches[0].name, 'Coach Champion');
  assert.equal(result.coaches[0].hallOfFameTier, true);
  assert.equal(result.coaches[0].stats.wins, 100);
  assert.equal(result.inductedCount, 1);
  assert.match(result.scoring, /national title 25/i);
});

test('empty or malformed records do not invent Hall of Fame achievements', () => {
  const result = buildCoachHallOfFame({ coaches: [{ userId: 'x', username: 'New Coach' }] });
  assert.equal(result.coachesReviewed, 1);
  assert.equal(result.inductedCount, 0);
  assert.equal(result.coaches[0].legacy.score, 0);
  assert.deepEqual(result.coaches[0].milestones, []);
});

test('limit is bounded and ranking ties are deterministic', () => {
  const result = buildCoachHallOfFame({ coaches: [
    { userId: '2', username: 'Zed' }, { userId: '1', username: 'Ada' }
  ] }, { limit: 100, getCareerStats: () => ({ wins: 5 }) });
  assert.equal(result.coaches.length, 2);
  assert.equal(result.coaches[0].name, 'Ada');
  assert.equal(result.coaches[0].rank, 1);
});
