'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeasonStorylines } = require('../utils/seasonStorylines');
function sample() { return { season: 1, teamSelections: [{team:'Alabama'},{team:'Auburn'},{team:'Georgia'}], scheduleGames: [
 {id:'1',season:1,week:1,homeTeam:'Alabama',awayTeam:'Auburn',homeScore:31,awayScore:7,status:'final'},
 {id:'2',season:1,week:2,homeTeam:'Alabama',awayTeam:'Georgia',homeScore:21,awayScore:14,status:'final'},
 {id:'3',season:1,week:3,homeTeam:'Georgia',awayTeam:'Auburn',homeScore:35,awayScore:3,status:'final'},
 {id:'4',season:1,week:4,homeTeam:'Alabama',awayTeam:'Auburn',homeScore:10,awayScore:17,status:'final'},
 {id:'5',season:1,week:5,homeTeam:'Alabama',awayTeam:'Auburn',homeScore:10,awayScore:17,status:'final'},
 {id:'7',season:1,week:6,homeTeam:'Alabama',awayTeam:'Georgia',homeScore:10,awayScore:0,status:'scheduled'},
 {id:'6',season:2,week:5,homeTeam:'Alabama',awayTeam:'Auburn',homeScore:0,awayScore:50,status:'final'}
] }; }
test('storylines detects current consecutive win and loss streaks from finalized results', () => {
 const result = buildSeasonStorylines(sample());
 assert.ok(result.streaks.some(row => row.team === 'Auburn' && row.type === 'win' && row.count === 2));
 assert.ok(result.streaks.some(row => row.team === 'Alabama' && row.type === 'loss' && row.count === 2));
});
test('storylines only uses finalized games in the requested season', () => {
 const result = buildSeasonStorylines(sample());
 assert.equal(result.gamesPlayed, 5);
 assert.ok(result.bestPerformances.every(row => row.week <= 5));
});
test('best performances are sorted by point margin and ranking climbs are grounded in weekly snapshots', () => {
 const result = buildSeasonStorylines(sample());
 assert.equal(result.bestPerformances[0].margin, 32);
 assert.ok(result.rankClimbs.every(row => row.places >= 2 && row.toRank < row.fromRank));
});
test('empty season produces safe empty storyline sections', () => {
 const result = buildSeasonStorylines({season: 9, scheduleGames: [], teamSelections: []});
 assert.equal(result.gamesPlayed, 0);
 assert.deepEqual(result.streaks, []);
 assert.deepEqual(result.rankClimbs, []);
 assert.deepEqual(result.bestPerformances, []);
});
