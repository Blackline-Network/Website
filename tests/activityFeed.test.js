'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActivityFeed, summarizeActivityFeed } = require('../utils/activityFeed');

test('activity feed includes finalized scores and recorded honors', () => {
  const feed = buildActivityFeed({ season: 3, scheduleGames: [{ season: 3, status: 'final', homeTeam: 'A', awayTeam: 'B', homeScore: 21, awayScore: 14, finalizedAt: '2026-09-01T12:00:00Z' }], heismanHistory: [{ season: 3, winner: 'Player X' }] });
  assert.equal(feed.length, 2);
  assert.ok(feed.some(x => x.title.includes('B 14 at A 21')));
  assert.ok(feed.some(x => x.title.includes('Player X')));
});

test('activity feed excludes non-final and invalid-score games', () => {
  const feed = buildActivityFeed({ season: 1, scheduleGames: [
    { season: 1, status: 'scheduled', homeTeam: 'A', awayTeam: 'B', homeScore: 0, awayScore: 0 },
    { season: 1, status: 'final', homeTeam: 'C', awayTeam: 'D', homeScore: 'bad', awayScore: 7 }
  ] });
  assert.equal(feed.length, 0);
});

test('activity feed hides staff identities and arbitrary audit details', () => {
  const feed = buildActivityFeed({ season: 2, staffAuditLog: [{ at: '2026-01-01T00:00:00Z', action: 'score-corrected', actorId: 'private-user-id', details: { score: '28-7', private: 'secret' } }] });
  assert.equal(feed.length, 1);
  assert.equal(feed[0].title, 'Final score corrected');
  assert.equal(JSON.stringify(feed).includes('private-user-id'), false);
  assert.equal(JSON.stringify(feed).includes('secret'), false);
});

test('feed deduplicates identical records and applies limit', () => {
  const dynasty = { season: 5, championshipHistory: [
    { season: 5, champion: 'A', recordedAt: '2026-01-01T00:00:00Z' },
    { season: 5, champion: 'A', recordedAt: '2026-01-01T00:00:00Z' },
    { season: 4, champion: 'B' }
  ] };
  assert.equal(buildActivityFeed(dynasty).length, 2);
  assert.equal(buildActivityFeed({ ...dynasty, championshipHistory: Array.from({ length: 15 }, (_, i) => ({ season: i, champion: `T${i}`, recordedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` })) }, { limit: 6 }).length, 6);
});

test('summary reports source counts', () => {
  const result = summarizeActivityFeed({ season: 1, notificationLog: [{ type: 'score', sentAt: '2026-01-01T00:00:00Z' }] });
  assert.equal(result.total, 1);
  assert.equal(result.counts.announcement, 1);
});


test('activity feed highlights explicit recruiting commitments and signings without inventing legacy history', () => {
  const feed = buildActivityFeed({ season: 4, recruitingProspects: [
    { name: 'Jordan Smith', team: 'Alabama', position: 'QB', stars: 5, season: 4, status: 'Signed', statusHistory: [
      { fromStatus: 'Offered', toStatus: 'Committed', team: 'Alabama', season: 4, at: '2026-09-01T10:00:00Z', actorId: 'private-staff-id' },
      { fromStatus: 'Committed', toStatus: 'Signed', team: 'Alabama', season: 4, at: '2026-09-02T10:00:00Z', actorId: 'private-staff-id' }
    ] },
    { name: 'Legacy Prospect', team: 'Auburn', position: 'WR', stars: 3, season: 4, status: 'Signed' }
  ] });
  assert.equal(feed.length, 2);
  assert.ok(feed.some(item => item.title.includes('Jordan Smith') && item.title.includes('committed to Alabama')));
  assert.ok(feed.some(item => item.title.includes('Jordan Smith') && item.title.includes('signed with Alabama')));
  assert.equal(JSON.stringify(feed).includes('Legacy Prospect'), false);
  assert.equal(JSON.stringify(feed).includes('private-staff-id'), false);
  assert.ok(feed.every(item => item.source === 'recruiting'));
});
