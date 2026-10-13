const test = require('node:test');
const assert = require('node:assert/strict');
const { coachLegacy, rankCoachLegacy, formatCoachLegacyLines } = require('../utils/coachLegacy');

test('legacy tier and milestones derive only from recorded career stats', () => {
  const result = coachLegacy({ wins: 100, losses: 30, ties: 2, titles: 2, conferenceTitles: 3, draftedPlayers: 12, heismanWinners: 1, entries: [{ startSeason: 1, endSeason: 8 }] });
  assert.equal(result.tier, 'Hall of Fame');
  assert.equal(result.games, 132);
  assert.ok(result.milestones.includes('100 career wins'));
  assert.ok(result.milestones.includes('10+ drafted players'));
});
test('empty or malformed stats remain safe and do not invent achievements', () => {
  const result = coachLegacy({ wins: -2, losses: 'bad', entries: [{ startSeason: 4, endSeason: 2 }] });
  assert.equal(result.tier, 'Rising Coach');
  assert.equal(result.games, 0);
  assert.deepEqual(result.milestones, []);
});
test('ranking is deterministic and orders by legacy score', () => {
  const ranked = rankCoachLegacy([{ name: 'New', stats: { wins: 3 } }, { name: 'Champion', stats: { wins: 20, titles: 1 } }]);
  assert.equal(ranked[0].name, 'Champion');
});
test('conference and national titles contribute separately', () => {
  assert.ok(coachLegacy({ conferenceTitles: 2 }).score > coachLegacy({}).score);
  assert.ok(coachLegacy({ titles: 1 }).score > coachLegacy({}).score);
});

test('public leaderboard lines show recorded stats and respect the requested limit', () => {
  const ranked = rankCoachLegacy([
    { name: 'Coach A', stats: { wins: 12, losses: 3, titles: 1 } },
    { name: 'Coach B', stats: { wins: 2, losses: 8 } }
  ]);
  const lines = formatCoachLegacyLines(ranked, 1);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Coach A/);
  assert.match(lines[0], /12-3/);
  assert.match(lines[0], /national title/);
});
