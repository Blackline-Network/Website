'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAllTimeAnalytics, calculateConferenceStandings } = require('../utils/dynastyAnalytics');
const dynasty = () => ({season:2,teamConferences:{'alabama':'SEC','Georgia':'SEC','Clemson':'ACC'},scheduleGames:[
 {season:1,week:1,status:'final',homeTeam:'Alabama',awayTeam:'Georgia',homeScore:28,awayScore:14},
 {season:2,week:1,status:'final',homeTeam:'Georgia',awayTeam:'Alabama',homeScore:21,awayScore:24},
 {season:2,week:2,status:'final',homeTeam:'Clemson',awayTeam:'Alabama',homeScore:10,awayScore:17},
 {season:2,week:3,status:'scheduled',homeTeam:'Alabama',awayTeam:'Clemson'}]});
test('all-time analytics only count valid final scores and calculate opponent strength',()=>{const a=calculateAllTimeAnalytics(dynasty());assert.equal(a.games,3);const al=a.teams.find(t=>t.name==='Alabama');assert.equal(al.wins,3);assert.equal(al.losses,0);assert.equal(al.games,3);assert.equal(al.opponentCount,3);assert.ok(al.strengthOfSchedule>=0&&al.strengthOfSchedule<=1);});
test('conference standings count only same-conference games in requested season',()=>{const rows=calculateConferenceStandings(dynasty(),2);assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.team),['Alabama','Georgia']);assert.equal(rows[0].wins,1);assert.equal(rows[1].losses,1);});
test('missing conferences and empty data are safe',()=>{assert.deepEqual(calculateConferenceStandings({season:1,scheduleGames:[]}),[]);assert.equal(calculateAllTimeAnalytics({}).games,0);});
