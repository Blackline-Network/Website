'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { programNamesFor, calculateProgramProfile } = require('../utils/programRecords');
function sampleDynasty() {
  return {
    teamSelections: [{ team: 'Alabama' }, { team: 'Georgia' }],
    scheduleGames: [
      { season: 1, week: 1, status: 'final', homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 24, awayScore: 17 },
      { season: 2, week: 2, status: 'final', homeTeam: 'Georgia', awayTeam: 'Alabama', homeScore: 21, awayScore: 28 },
      { season: 2, week: 3, status: 'scheduled', homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: null, awayScore: null }
    ], championshipHistory: [{ season: 2, champion: 'Alabama' }],
    conferenceChampionsHistory: [{ season: 1, conference: 'SEC', champion: 'Alabama' }],
    heismanHistory: [{ season: 1, winner: 'Player One', team: 'Alabama' }],
    draftHistory: [{ season: 2, player: 'Player Two', team: 'Alabama' }], awardHistory: [],
    coachCareers: { '123': [{ team: 'Alabama', startSeason: 1, endSeason: 2, wins: 2, losses: 0, ties: 0 }] }
  };
}
test('program list combines existing sources without duplicate names', () => {
  const dynasty = sampleDynasty();
  dynasty.scheduleGames.push({ season: 3, status: 'scheduled', homeTeam: ' ALABAMA ', awayTeam: 'Texas' });
  assert.deepEqual(programNamesFor(dynasty), ['Alabama', 'Georgia', 'Texas']);
});
test('profile counts only final scores and aggregates recorded honors and seasons', () => {
  const p = calculateProgramProfile(sampleDynasty(), 'Alabama');
  assert.equal(p.record.wins, 2); assert.equal(p.record.losses, 0); assert.equal(p.games.length, 2);
  assert.equal(p.titles.length, 1); assert.equal(p.conferenceTitles.length, 1);
  assert.equal(p.heismans.length, 1); assert.equal(p.draftPicks.length, 1);
  assert.equal(p.careers.length, 1); assert.equal(p.record.seasons.get(2).wins, 1);
});
test('profile safely handles a program with no results or history', () => {
  const p = calculateProgramProfile({ scheduleGames: [] }, 'New Team');
  assert.equal(p.games.length, 0); assert.equal(p.record.wins, 0); assert.equal(p.record.pf, 0);
  assert.equal(p.titles.length, 0); assert.equal(p.careers.length, 0);
});
