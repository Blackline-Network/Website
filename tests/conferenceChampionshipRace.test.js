'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConferenceChampionshipRace } = require('../utils/conferenceChampionshipRace');

test('conference race ranks teams on finalized in-conference results and tracks scheduled games', () => {
  const dynasty = {
    season: 3,
    teamConferences: { Alabama: 'SEC', Auburn: 'SEC', Georgia: 'SEC', Clemson: 'ACC' },
    teamSelections: [{ team: 'Alabama' }, { team: 'Auburn' }, { team: 'Georgia' }, { team: 'Clemson' }],
    scheduleGames: [
      { season: 3, week: 1, homeTeam: 'Alabama', awayTeam: 'Auburn', homeScore: 28, awayScore: 14, status: 'final' },
      { season: 3, week: 2, homeTeam: 'Alabama', awayTeam: 'Georgia', homeScore: 24, awayScore: 21, status: 'final' },
      { season: 3, week: 3, homeTeam: 'Auburn', awayTeam: 'Georgia', status: 'scheduled' },
      { season: 3, week: 4, homeTeam: 'Alabama', awayTeam: 'Clemson', homeScore: 10, awayScore: 20, status: 'final' }
    ]
  };
  const result = buildConferenceChampionshipRace(dynasty);
  const sec = result.races.find(group => group.conference === 'SEC');
  assert.equal(sec.standings[0].team, 'Alabama');
  assert.equal(sec.standings[0].record, '2-0');
  assert.equal(sec.standings.find(row => row.team === 'Auburn').remainingConferenceGames, 1);
  assert.equal(sec.scheduledConferenceGamesRemaining, 1);
  assert.equal(result.gamesConsidered, 3);
});

test('conference race excludes other seasons, invalid scores, self-matchups and cross-conference results from conference records', () => {
  const result = buildConferenceChampionshipRace({
    season: 2,
    teamConferences: { A: 'North', B: 'North', C: 'South' },
    scheduleGames: [
      { season: 1, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: 100, awayScore: 0, status: 'final' },
      { season: 2, week: 1, homeTeam: 'A', awayTeam: 'B', homeScore: '21', awayScore: 0, status: 'final' },
      { season: 2, week: 2, homeTeam: 'A', awayTeam: 'A', homeScore: 21, awayScore: 0, status: 'final' },
      { season: 2, week: 3, homeTeam: 'A', awayTeam: 'C', homeScore: 7, awayScore: 14, status: 'final' },
      { season: 2, week: 4, homeTeam: 'A', awayTeam: 'B', homeScore: 14, awayScore: 7, status: 'final' }
    ]
  });
  const north = result.races.find(group => group.conference === 'North');
  const a = north.standings.find(row => row.team === 'A');
  assert.equal(a.record, '1-0');
  assert.equal(a.overallRecord, '1-1');
  assert.equal(result.gamesConsidered, 2);
});

test('conference race preserves explicit historical champion records without inferring clinches', () => {
  const result = buildConferenceChampionshipRace({
    season: 4,
    conferenceChampionsHistory: [{ season: 4, conference: 'Big Ten', champion: 'Michigan' }],
    teamConferences: { Michigan: 'Big Ten', Ohio: 'Big Ten' },
    scheduleGames: []
  });
  const group = result.races[0];
  assert.equal(group.recordedChampion, 'Michigan');
  assert.equal(group.hasRecordedConferenceResults, false);
  assert.equal(group.leader.team, 'Michigan');
});
