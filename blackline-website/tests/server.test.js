'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

async function freePort() {
  return await new Promise((resolve,reject)=>{ const s=net.createServer(); s.once('error',reject); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));}); });
}

test('website API uses configured data, keeps safe public fields, and denies unauthenticated queue access', async t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'blackline-web-test-'));
  const dataPath=path.join(temp,'dynasties.json');
  fs.writeFileSync(dataPath,JSON.stringify({dynasties:[{id:'league-1',name:'Test League',game:'ncaa',season:2,seasonYear:2026,coaches:[{userId:'private-user',username:'Coach'}],teams:['Alpha','Beta'],teamSelections:[{team:'Alpha',username:'Coach',userId:'private-user'}],teamConferences:{Alpha:'East',Beta:'East'},rankings:['Beta','Alpha'],seasonRankings:[{season:2,updatedAt:'2026-10-01T12:00:00.000Z',updatedBy:'private-user',teams:['Beta','Alpha']}],scheduleGames:[{id:'old-g1',season:1,week:4,homeTeam:'Alpha',awayTeam:'Beta',homeScore:14,awayScore:10,status:'final'},{id:'g1',season:2,week:1,homeTeam:'Alpha',awayTeam:'Beta',homeScore:28,awayScore:21,status:'final'},{id:'g2',season:2,week:2,homeTeam:'Beta',awayTeam:'Alpha',status:'scheduled'}],playoffBracket:{semifinal:{homeTeam:'Alpha',awayTeam:'Beta',winner:'Alpha'},updatedBy:'private-user'},championshipHistory:[{season:1,champion:'Alpha',runnerUp:'Beta',updatedBy:'private-user'}],conferenceChampionsHistory:[{conference:'East',champion:'Alpha'}],recordHistory:[{record:'Most wins',team:'Alpha',value:12}],awardHistory:[{award:'Coach of the Year',recipient:'Coach One',season:2,userId:'private-user'}],coachCareers:[{name:'Coach One',wins:12,losses:3,discordId:'private-user'}],connection:{username:'secret',password:'secret'},guildId:'private-guild'}]}));
  const port=await freePort();
  const child=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:String(port),DYNASTY_DATA_PATH:dataPath,WEBSITE_REQUESTS_PATH:path.join(temp,'requests.json'),WEBSITE_AUDIT_PATH:path.join(temp,'audit.json'),DISCORD_CLIENT_ID:'',DISCORD_CLIENT_SECRET:'',DISCORD_REDIRECT_URI:'',DISCORD_GUILD_ID:''},stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d);
  t.after(async()=>{
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
    if (child.exitCode === null) {
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    try { fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}); } catch (error) { if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'ENOTEMPTY') throw error; }
  });
  const base=`http://127.0.0.1:${port}`; let ready=false;
  for(let i=0;i<60;i++){ if(child.exitCode!==null) break; try { const r=await fetch(`${base}/api/health`); if(r.ok){ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert.equal(ready,true,`server did not start: ${output}`);
  const health=await (await fetch(`${base}/api/health`)).json(); assert.equal(health.ok,true); assert.equal(health.dataConnected,true); assert.equal(health.authConfigured,false);
  const response=await fetch(`${base}/api/dynasties`); assert.equal(response.status,200); const payload=await response.json(); assert.equal(payload.dynasties[0].name,'Test League');
  const serialized=JSON.stringify(payload); assert.equal(serialized.includes('private-user'),false); assert.equal(serialized.includes('secret'),false); assert.equal(serialized.includes('private-guild'),false);
  const workspaceResponse=await fetch(`${base}/api/dynasties/league-1/workspace`); assert.equal(workspaceResponse.status,200); const workspace=await workspaceResponse.json();
  assert.equal(workspace.dynasty.season,2); assert.equal(workspace.summary.finals,1); assert.equal(workspace.summary.scheduled,1); assert.equal(workspace.standings[0].team,'Alpha'); assert.equal(workspace.standings[0].wins,1); assert.equal(workspace.standings[0].record,'1-0'); assert.equal(workspace.standings[0].pointDifferential,7); assert.equal(workspace.rankings[0].team,'Beta'); assert.equal(workspace.conferences.East.length,2); assert.equal(workspace.recentResults[0].winner,'Alpha'); assert.equal(workspace.teamLeaders[0].team,'Alpha'); assert.equal(workspace.playoffBracket.semifinal.winner,'Alpha'); assert.equal(workspace.championshipHistory[0].champion,'Alpha'); assert.equal(workspace.conferenceChampionsHistory[0].conference,'East'); assert.equal(workspace.recordHistory[0].record,'Most wins'); assert.equal(workspace.seasonHistory[0].season,2); assert.equal(workspace.seasonHistory[0].games,1); assert.equal(workspace.seasonHistory[0].pointsScored,49); assert.equal(workspace.seasonHistory[0].highestScoringGame.totalPoints,49); assert.equal(workspace.seasonHistory[1].season,1); assert.equal(workspace.seasonHistory[1].pointsScored,24);
  assert.equal(JSON.stringify(workspace).includes('private-user'),false); assert.equal(JSON.stringify(workspace).includes('secret'),false); assert.equal(JSON.stringify(workspace).includes('updatedBy'),false);
  const featureResponse=await fetch(`${base}/api/dynasties/league-1/features`); assert.equal(featureResponse.status,200); const featureHub=await featureResponse.json(); assert.equal(featureHub.dynasty.name,'Test League'); assert.equal(featureHub.features['Awards & Honors'][0].items[0].award,'Coach of the Year'); const featureSerialized=JSON.stringify(featureHub); assert.equal(featureSerialized.includes('private-user'),false); assert.equal(featureSerialized.includes('secret'),false); assert.equal(featureSerialized.includes('private-guild'),false);
  const missingFeatures=await fetch(`${base}/api/dynasties/nope/features`); assert.equal(missingFeatures.status,404);
  const missingWorkspace=await fetch(`${base}/api/dynasties/nope/workspace`); assert.equal(missingWorkspace.status,404);
  const requests=await fetch(`${base}/api/requests`); assert.equal(requests.status,401);
  const dashboard=await fetch(`${base}/api/me/dashboard`); assert.equal(dashboard.status,401);
  const teamClaim=await fetch(`${base}/api/team-claims`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dynastyId:'league-1',team:'Beta'})}); assert.equal(teamClaim.status,401);
  const scoreReport=await fetch(`${base}/api/score-reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dynastyId:'league-1',week:1,homeTeam:'Alpha',awayTeam:'Beta',homeScore:21,awayScore:14})}); assert.equal(scoreReport.status,401);
  const recruiting=await fetch(`${base}/api/recruiting-actions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dynastyId:'league-1',name:'Prospect Test',team:'Alpha',position:'QB',stars:5,status:'Offered'})}); assert.equal(recruiting.status,401);
  const myActions=await fetch(`${base}/api/my-actions`); assert.equal(myActions.status,401);
  const ownRequests=await fetch(`${base}/api/my-requests`); assert.equal(ownRequests.status,401);
  const homepage=await fetch(base); assert.equal(homepage.status,200); assert.match(await homepage.text(),/Platform tools/);
  const app=await fetch(`${base}/app.js`); assert.equal(app.status,200); const appText=await app.text(); assert.match(appText,/League Control/); assert.match(appText,/Data Health & Recovery/); assert.match(appText,/Discord Panels/); assert.match(appText,/staffQueueStatus/); assert.match(appText,/staffQueueSearch/); assert.match(appText,/Previous staff note/); assert.match(appText,/Save review/); assert.match(appText,/My bot actions/); assert.match(appText,/api\/my-actions/); assert.match(appText,/Score reports remain unofficial/); assert.match(appText,/refreshMemberDashboard/); assert.match(appText,/action-status/); assert.match(appText,/Refresh failed/); assert.match(appText,/homeTeam/); assert.match(appText,/memberActionStatus/); assert.match(appText,/memberActionType/); assert.match(appText,/No bot actions match these filters/); assert.match(appText,/clearMemberActionFilters/); assert.match(appText,/Published power rankings/); assert.match(appText,/Official season standings/); assert.match(appText,/Recent final scores/); assert.match(appText,/Team scoring leaders/); const serverSource=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8'); assert.match(serverSource,/prospectStatus:status/); assert.match(serverSource,/name:a\.name,prospectStatus:a\.prospectStatus/); const bridgeSource=fs.readFileSync(path.join(__dirname,'..','..','utils','websiteActionBridge.js'),'utf8'); assert.match(bridgeSource,/action\.prospectStatus \|\| action\.recruitingStatus/); assert.match(appText,/a\.prospectStatus/);
  const traversal=await fetch(`${base}/../../.env.example`); assert.notEqual(traversal.status,200);
});

test('website loads the project-root .env without requiring node -r dotenv/config', async t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'blackline-web-env-test-'));
  const project=path.join(temp,'project');
  const website=path.join(project,'blackline-website');
  fs.mkdirSync(path.join(website,'public'),{recursive:true});
  fs.mkdirSync(path.join(project,'utils'),{recursive:true});
  fs.mkdirSync(path.join(project,'data'),{recursive:true});
  fs.copyFileSync(path.join(__dirname,'..','server.js'),path.join(website,'server.js'));
  fs.copyFileSync(path.join(__dirname,'..','..','utils','atomicJsonWrite.js'),path.join(project,'utils','atomicJsonWrite.js'));
  fs.copyFileSync(path.join(__dirname,'..','public','index.html'),path.join(website,'public','index.html'));
  fs.writeFileSync(path.join(project,'data','dynasties.json'),JSON.stringify({dynasties:[]}));
  fs.writeFileSync(path.join(project,'.env'),[
    'DISCORD_CLIENT_ID=test-client-id',
    'DISCORD_CLIENT_SECRET=test-client-secret',
    'DISCORD_REDIRECT_URI=http://localhost:3030/auth/callback',
    'DISCORD_GUILD_ID=test-guild-id',
    'BLACKLINE_STAFF_ROLE_IDS=staff-role-test',
    'BLACKLINE_MANAGER_ROLE_IDS=manager-role-test'
  ].join('\n'));
  const port=await freePort();
  const env={...process.env,PORT:String(port),DYNASTY_DATA_PATH:path.join(project,'data','dynasties.json'),WEBSITE_REQUESTS_PATH:path.join(temp,'requests.json'),WEBSITE_AUDIT_PATH:path.join(temp,'audit.json')};
  for(const key of ['DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_REDIRECT_URI','DISCORD_GUILD_ID','BLACKLINE_STAFF_ROLE_IDS','BLACKLINE_MANAGER_ROLE_IDS']) delete env[key];
  const child=spawn(process.execPath,[path.join(website,'server.js')],{cwd:project,env,stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',d=>output+=d); child.stderr.on('data',d=>output+=d);
  t.after(async()=>{
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
    if (child.exitCode === null) {
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
    try { fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}); } catch (error) { if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'ENOTEMPTY') throw error; }
  });
  const base=`http://127.0.0.1:${port}`; let health=null;
  for(let i=0;i<60;i++) { if(child.exitCode!==null) break; try { const r=await fetch(`${base}/api/health`); if(r.ok){health=await r.json();break;} } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert.ok(health,`server did not start: ${output}`);
  assert.equal(health.authConfigured,true);
  assert.equal(health.dataConnected,true);
  assert.match(output,/Discord OAuth configured: yes/);
});

// Fix 122: published feature workspace supports searchable category filtering.
const featureAppSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
assert.match(featureAppSource, /featureRecordSearch/);
assert.match(featureAppSource, /featureRecordCategory/);
assert.match(featureAppSource, /filterRecords/);
assert.match(featureAppSource, /rows\.map\(\(\{source,item,index\}\)=>/);
assert.match(featureAppSource, /visibleRecords\+\+/);
assert.match(featureAppSource, /record\.hidden=!/);

// Fix 124: all-season score history is shown separately from current-season standings.
assert.match(featureAppSource, /Season score history/);
assert.match(featureAppSource, /data\.seasonHistory/);

// Fix 125: team profiles derive their details from the live workspace data.
{ const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8'); assert.ok(app.includes('Team profiles')); assert.ok(app.includes('teamProfileSelect')); assert.ok(app.includes('Season matchups')); assert.ok(app.includes('data.teamAssignments.find')); assert.ok(app.includes('data.rankings.find')); }

// Fix 126: unified player/prospect profiles combine published roster and recruiting history.
{ const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
  assert.ok(app.includes('Player & prospect profiles'));
  assert.ok(app.includes('rosterPlayers'));
  assert.ok(app.includes('recruitingProspects'));
  assert.ok(app.includes('playerDevelopmentHistory'));
  assert.ok(app.includes('playerProfileSearch'));
  assert.ok(app.includes('playerProfileTeam'));
  assert.ok(app.includes('View profile history'));
}


test('Fix 127 player leaderboard reads published numeric player statistics', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /Player leaderboards/);
  assert.match(source, /playerSeasonStats/);
  assert.match(source, /playerStatLeaders/);
  assert.match(source, /playerLeaderboardMetric/);
  assert.match(source, /No published player-stat records are available yet/);
});


test('Fix 128 player leaderboards support search and tie-aware ranks', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardSearch/);
  assert.match(source, /Tied values share a rank/);
  assert.match(source, /competitionRank=i\+1/);
  assert.match(source, /No players match this search/);
});


test('Fix 129 player leaderboards can isolate published data sources', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardSource/);
  assert.match(source, /Data source/);
  assert.match(source, /sourceFilter==='all'\|\|r\.source===sourceFilter/);
  assert.match(source, /compare like-for-like records/);
});


test('Fix 130 player leaderboards support team and position filters', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardTeam/);
  assert.match(source, /playerLeaderboardPosition/);
  assert.match(source, /teamFilter==='all'/);
  assert.match(source, /positionFilter==='all'/);
  assert.match(source, /All teams/);
  assert.match(source, /All positions/);
});


test('Fix 131 player leaderboards export the active filtered results as CSV', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardExport/);
  assert.match(source, /Export filtered CSV/);
  assert.match(source, /blackline-player-leaderboard\.csv/);
  assert.match(source, /replace\(/);
  assert.match(source, /text\/csv;charset=utf-8/);
});


test('Fix 132 player leaderboards provide a one-click filter reset', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardReset/);
  assert.match(source, /selectedIndex=0/);
  assert.ok(source.includes("playerLeaderboardSearch').value=''"));
  assert.match(source, /render\(\);\}\);root\.querySelector\('#playerLeaderboardExport'/);
});

test('Fix 132 CSV export guards text cells against spreadsheet formula injection', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /typeof value==='string'/);
  assert.ok(source.includes('typeof value===\'string\'&&/^[\\s\\u0000-\\u001f]*[=+@\\-]/.test(raw)'));
});


test('Fix 133 player leaderboards support ascending and descending statistic order', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardSort/);
  assert.match(source, /Highest first/);
  assert.match(source, /Lowest first/);
  assert.match(source, /sortOrder==='asc'\?a\.item\[metric\]-b\.item\[metric\]:b\.item\[metric\]-a\.item\[metric\]/);
  assert.ok(source.includes("playerLeaderboardSort').value='desc'"));
});


test('Fix 134 player leaderboards allow changing the visible row limit', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardLimit/);
  assert.match(source, /25 rows/);
  assert.match(source, /50 rows/);
  assert.match(source, /100 rows/);
  assert.match(source, /All matching/);
  assert.match(source, /rowLimit===0\?ranked:ranked\.slice\(0,rowLimit\)/);
  assert.ok(source.includes("playerLeaderboardLimit').value='25'"));
});


test('Fix 135 player leaderboards provide an accessible quick-clear search control', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardClearSearch/);
  assert.match(source, /aria-label="Clear leaderboard search"/);
  assert.match(source, /Clear search/);
  assert.ok(source.includes("search.value='';search.focus();render();"));
});


test('Fix 136 player leaderboards summarize the current filtered statistic', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardSummary/);
  assert.match(source, /leaderboard-summary-card/);
  assert.match(source, /const aggregate=values\.reduce/);
  assert.match(source, /min:Math\.min\(acc\.min,value\),max:Math\.max\(acc\.max,value\)/);
  assert.match(source, /const average=aggregate\.sum\/values\.length/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /No summary available for the current filters/);
});


test('Fix 137 player leaderboards can export a filtered statistic summary CSV', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /playerLeaderboardSummaryExport/);
  assert.match(source, /Export summary CSV/);
  assert.match(source, /blackline-player-leaderboard-summary\.csv/);
  assert.match(source, /\['Matching records',matching\.length\]/);
  assert.match(source, /\['Average',Number\(\(sum\/values\.length\)\.toFixed\(2\)\)\]/);
  assert.match(source, /\['Minimum',Math\.min\(\.\.\.values\)\]/);
  assert.match(source, /\['Maximum',Math\.max\(\.\.\.values\)\]/);
});


test('Fix 138 leaderboard summary CSV records active filters and honors sort order for leader', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(source, /const sortOrder=root\.querySelector\('#playerLeaderboardSort'\)\.value/);
  assert.match(source, /\['Sort order',sortOrder==='asc'\?'Lowest first':'Highest first'\]/);
  assert.match(source, /\['Data source',sourceFilter==='all'\?'All sources':sourceFilter\]/);
  assert.match(source, /\['Team',teamFilter==='all'\?'All teams':teamFilter\]/);
  assert.match(source, /\['Position',positionFilter==='all'\?'All positions':positionFilter\]/);
  assert.match(source, /\['Search',searchText\]/);
  assert.match(source, /sortOrder==='asc'\?a\.item\[metric\]-b\.item\[metric\]:b\.item\[metric\]-a\.item\[metric\]/);
});


test('Fix 141 community feed supports authenticated, CSRF-protected post reactions', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'community.js'), 'utf8');
  assert.match(server, /communityLikeMatch/);
  assert.match(server, /requireAuth\(req,res\); if\(!s\) return; if\(!requireCsrf\(req,res,s\)\) return; if\(!rateLimit\(req,res,'community-like',30\)\) return/);
  assert.match(server, /community_post_liked/);
  assert.match(client, /aria-pressed/);
  assert.match(client, /data-like/);
  assert.match(client, /community\/posts\/\$\{encodeURIComponent\(button\.dataset\.like\)\}\/like/);
});
