'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { atomicJsonWrite } = require('../utils/atomicJsonWrite');

// The website lives one directory below the project's root .env. Load it here
// so `node server.js` works from either the project root or this directory.
// Keep an already supplied process environment authoritative (dotenv default).
function loadProjectEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    require('dotenv').config({ path: envPath });
    return;
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  // Built-in fallback keeps the website runnable without optional dependencies.
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('`') && value.endsWith('`'))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    process.env[match[1]] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
}
loadProjectEnv();

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3030);
// This resolves correctly when the website is nested inside the bot project.
const DATA_PATH = path.resolve(process.env.DYNASTY_DATA_PATH || path.join(ROOT, '..', 'data', 'dynasties.json'));
const REQUESTS_PATH = path.resolve(process.env.WEBSITE_REQUESTS_PATH || path.join(ROOT, '..', 'data', 'website-requests.json'));
const AUDIT_PATH = path.resolve(process.env.WEBSITE_AUDIT_PATH || path.join(ROOT, '..', 'data', 'website-audit.json'));
const ACTIONS_PATH = path.resolve(process.env.WEBSITE_ACTIONS_PATH || path.join(ROOT, '..', 'data', 'website-actions'));
const COMMUNITY_PATH = path.resolve(process.env.WEBSITE_COMMUNITY_PATH || path.join(ROOT, '..', 'data', 'website-community.json'));
const CREATOR_PROFILES_PATH = path.resolve(process.env.WEBSITE_CREATOR_PROFILES_PATH || path.join(ROOT, '..', 'data', 'website-creator-profiles.json'));
const STREAM_STATUS_PATH = path.resolve(process.env.WEBSITE_STREAM_STATUS_PATH || path.join(ROOT, '..', 'data', 'website-stream-status.json'));
const TWITCH_LINKS_PATH = path.resolve(process.env.WEBSITE_TWITCH_LINKS_PATH || path.join(ROOT, '..', 'data', 'website-twitch-links.json'));
const twitchOauthStates = new Map();
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon' };
const sessions = new Map();
const oauthStates = new Map();
const rateLimits = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const STAFF_ROLE_IDS = new Set((process.env.BLACKLINE_STAFF_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const MANAGER_ROLE_IDS = new Set((process.env.BLACKLINE_MANAGER_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const COOKIE_NAME = 'blackline_session';
const isProduction = process.env.NODE_ENV === 'production';

function parseCookies(header='') { return Object.fromEntries(header.split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))]; })); }
function safeEqual(a,b) { const aa=Buffer.from(String(a||'')); const bb=Buffer.from(String(b||'')); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
function send(res, status, body, type='application/json; charset=utf-8', extra={}) {
  res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'", ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function safeDynasty(d, mtime) {
  return {
    id:String(d.id||''), name:String(d.name||'Unnamed Dynasty'), game:String(d.game||'other'), platform:String(d.platform||'Crossplay'), status:String(d.status||'active'),
    season:Number(d.season||1), seasonYear:Number(d.seasonYear||new Date().getFullYear()), currentWeek:Number(d.currentWeek||0),
    currentPhaseLabel:String(d.currentPhaseLabel||d.currentPhase||'Off-Season'), coachCount:Array.isArray(d.coaches)?d.coaches.length:Number(d.coachCount||0), maxCoaches:Number(d.maxCoaches||32),
    defendingChampion:String(d.defendingChampion||'Not set'), gameOfTheWeek:String(d.gameOfTheWeek||'Not announced'), automaticAdvance:Boolean(d.automaticAdvance),
    nextAdvance:String(d.nextAdvance||'Check Discord for the schedule'), rankings:Array.isArray(d.rankings)?d.rankings.slice(0,4).map(String):[],
    bubbleTeams:Array.isArray(d.bubbleTeams)?d.bubbleTeams.slice(0,4).map(String):[], rules:Array.isArray(d.rules)?d.rules.map(String):[],
    teamSelections:Array.isArray(d.teamSelections)?d.teamSelections.map(s=>({team:String(s.team||'Team TBD'),coach:String(s.username||s.coachName||'Coach')})):[],
    teams:Array.isArray(d.teams)?d.teams.map(t=>typeof t==='string'?t:String(t.name||t.team||'Team')):[], updatedAt:mtime
  };
}
function readDynasties() {
  try { const stat=fs.statSync(DATA_PATH); const parsed=JSON.parse(fs.readFileSync(DATA_PATH,'utf8')); if(!parsed||!Array.isArray(parsed.dynasties)) throw new Error('Expected a dynasties array'); return parsed.dynasties.map(d=>safeDynasty(d,stat.mtime.toISOString())); }
  catch (error) { if (error.code!=='ENOENT') console.error('[website] Could not read dynasty data:',error.message); return null; }
}
function buildWorkspace(d, updatedAt) {
  const season = Number(d.season || 1);
  const allStoredGames = (Array.isArray(d.scheduleGames) ? d.scheduleGames : []).filter(g => g && typeof g === 'object');
  const historicalFinals = allStoredGames.filter(g => String(g.status || '').toLowerCase() === 'final' && Number.isFinite(Number(g.homeScore)) && g.homeScore !== null && Number.isFinite(Number(g.awayScore)) && g.awayScore !== null && g.homeTeam && g.awayTeam && g.homeTeam !== 'TBD' && g.awayTeam !== 'TBD');
  const seasonHistoryMap = new Map();
  for (const g of historicalFinals) {
    const gameSeason = Number.isFinite(Number(g.season)) && Number(g.season) > 0 ? Number(g.season) : season;
    if (!seasonHistoryMap.has(gameSeason)) seasonHistoryMap.set(gameSeason, { season: gameSeason, games: 0, teams: new Set(), pointsScored: 0, highestScoringGame: null });
    const summary = seasonHistoryMap.get(gameSeason);
    summary.games++;
    summary.teams.add(String(g.homeTeam)); summary.teams.add(String(g.awayTeam));
    summary.pointsScored += Number(g.homeScore) + Number(g.awayScore);
    const combined = Number(g.homeScore) + Number(g.awayScore);
    if (!summary.highestScoringGame || combined > summary.highestScoringGame.totalPoints) summary.highestScoringGame = { homeTeam: String(g.homeTeam), awayTeam: String(g.awayTeam), homeScore: Number(g.homeScore), awayScore: Number(g.awayScore), totalPoints: combined, week: Number.isFinite(Number(g.week)) ? Number(g.week) : null };
  }
  const seasonHistory = [...seasonHistoryMap.values()].map(item => ({ season: item.season, games: item.games, teams: item.teams.size, pointsScored: item.pointsScored, pointsPerGame: Number((item.pointsScored / item.games).toFixed(1)), highestScoringGame: item.highestScoringGame })).sort((a,b) => b.season-a.season).slice(0,20);
  const games = allStoredGames
    .filter(g => g && (g.season == null || Number(g.season) === season))
    .map(g => ({
      id: String(g.id || ''), season: Number(g.season || season), week: Number.isFinite(Number(g.week)) ? Number(g.week) : null,
      homeTeam: String(g.homeTeam || 'TBD'), awayTeam: String(g.awayTeam || 'TBD'),
      homeScore: Number.isFinite(Number(g.homeScore)) && g.homeScore !== null ? Number(g.homeScore) : null,
      awayScore: Number.isFinite(Number(g.awayScore)) && g.awayScore !== null ? Number(g.awayScore) : null,
      status: String(g.status || 'scheduled'), kickoff: String(g.kickoff || ''),
      winner: String(g.winner || '')
    }));
  const table = new Map();
  const row = team => {
    const key = String(team || 'TBD');
    if (!table.has(key)) table.set(key, { team:key, wins:0, losses:0, ties:0, pointsFor:0, pointsAgainst:0, games:0 });
    return table.get(key);
  };
  for (const g of games) {
    if (g.status !== 'final' || g.homeScore === null || g.awayScore === null || g.homeTeam === 'TBD' || g.awayTeam === 'TBD') continue;
    const h=row(g.homeTeam), a=row(g.awayTeam); h.games++; a.games++;
    h.pointsFor+=g.homeScore; h.pointsAgainst+=g.awayScore; a.pointsFor+=g.awayScore; a.pointsAgainst+=g.homeScore;
    if (g.homeScore > g.awayScore) { h.wins++; a.losses++; }
    else if (g.awayScore > g.homeScore) { a.wins++; h.losses++; }
    else { h.ties++; a.ties++; }
  }
  const teams = [...new Set([...(Array.isArray(d.teams)?d.teams.map(t=>typeof t==='string'?t:t?.name||t?.team||''):[]), ...(Array.isArray(d.teamSelections)?d.teamSelections.map(t=>t?.team||t?.teamName||''):[]), ...games.flatMap(g=>[g.homeTeam,g.awayTeam])].map(String).filter(t=>t && t!=='TBD'))].sort((a,b)=>a.localeCompare(b));
  // Include teams with no completed games so early-season standings never hide a team.
  for (const team of teams) if (!table.has(team)) table.set(team,{team,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0,games:0,winPercentage:0,pointDifferential:0,record:'0-0'});
  const rankedStandings = [...table.values()].map(r => ({...r, winPercentage:r.games ? (r.wins+r.ties*.5)/r.games : 0, pointDifferential:r.pointsFor-r.pointsAgainst, record:`${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`})).sort((a,b)=>b.winPercentage-a.winPercentage || b.pointDifferential-a.pointDifferential || b.pointsFor-a.pointsFor || a.team.localeCompare(b.team));
  const selections = (Array.isArray(d.teamSelections)?d.teamSelections:[]).map(x=>({team:String(x.team||x.teamName||'Team TBD'), coach:String(x.username||x.coachName||'Coach assigned')}));
  const finals=games.filter(g=>g.status==='final'&&g.homeScore!==null&&g.awayScore!==null&&g.homeTeam!=='TBD'&&g.awayTeam!=='TBD');
  const seasonRankingRecords=(Array.isArray(d.seasonRankings)?d.seasonRankings:[]).filter(r=>r&&Number(r.season)===season&&Array.isArray(r.teams)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const latestRanking=seasonRankingRecords[0]||null;
  const rankedTeams=(latestRanking?.teams||d.rankings||[]).map((entry,index)=>{ const team=typeof entry==='string'?entry:String(entry?.team||entry?.name||entry?.school||''); const explicit=Number(entry?.rank||entry?.ranking||entry?.seed); return {rank:Number.isInteger(explicit)&&explicit>0?explicit:index+1,team,record:rankedStandings.find(r=>r.team.toLowerCase()===team.toLowerCase())?.record||'—',winPercentage:rankedStandings.find(r=>r.team.toLowerCase()===team.toLowerCase())?.winPercentage??null}; }).filter(r=>r.team&&r.team!=='N/A').sort((a,b)=>a.rank-b.rank).slice(0,50);
  const conferenceMap=d.teamConferences&&typeof d.teamConferences==='object'&&!Array.isArray(d.teamConferences)?d.teamConferences:{};
  const conferences={};
  for(const row of rankedStandings){ const key=Object.keys(conferenceMap).find(k=>k.trim().toLowerCase()===row.team.trim().toLowerCase()); const conf=key?String(conferenceMap[key]||'').trim():''; if(conf){(conferences[conf] ||= []).push(row);} }
  const recentResults=[...finals].sort((a,b)=>(b.week??-1)-(a.week??-1)).slice(0,12).map(g=>({...g,winner:g.homeScore===g.awayScore?'Tie':g.homeScore>g.awayScore?g.homeTeam:g.awayTeam,pointDifferential:Math.abs(g.homeScore-g.awayScore)}));
  const teamLeaders=[...rankedStandings].filter(r=>r.games).sort((a,b)=>(b.pointsFor/Math.max(1,b.games))-(a.pointsFor/Math.max(1,a.games))).slice(0,10).map(r=>({team:r.team,games:r.games,pointsFor:r.pointsFor,pointsAgainst:r.pointsAgainst,pointsPerGame:Number((r.pointsFor/Math.max(1,r.games)).toFixed(1)),pointDifferential:r.pointDifferential}));
  return { dynasty:{id:String(d.id||''),name:String(d.name||'Unnamed Dynasty'),season,seasonYear:Number(d.seasonYear||new Date().getFullYear()),currentWeek:Number(d.currentWeek||0),phase:String(d.currentPhaseLabel||d.currentPhase||'Off-Season'),status:String(d.status||'active')}, teams, teamAssignments:selections, schedule:games.sort((a,b)=>(a.week??999)-(b.week??999)||a.homeTeam.localeCompare(b.homeTeam)), standings:rankedStandings, rankings:rankedTeams, rankingUpdatedAt:latestRanking?.updatedAt||null, conferences, recentResults, teamLeaders, playoffBracket:publicFeatureValue(d.playoffBracket)||null, championshipHistory:publicFeatureValue(Array.isArray(d.championshipHistory)?d.championshipHistory:[]), conferenceChampionsHistory:publicFeatureValue(Array.isArray(d.conferenceChampionsHistory)?d.conferenceChampionsHistory:[]), recordHistory:publicFeatureValue(Array.isArray(d.recordHistory)?d.recordHistory:[]), awardHistory:publicFeatureValue(Array.isArray(d.awardHistory)?d.awardHistory:[]), summary:{scheduled:games.length-finals.length,finals:finals.length,teams:teams.length,coaches:Array.isArray(d.coaches)?d.coaches.length:0}, seasonHistory, updatedAt };
}

const FEATURE_FIELDS = {
  'Schedule & Results': ['scheduleGames'],
  'Standings & Rankings': ['seasonRankings','rankings','bubbleTeams','teamConferences'],
  'Playoffs & Championships': ['playoffBracket','championshipHistory','conferenceChampionsHistory'],
  'Recruiting': ['recruitingProspects','recruitingHistory'],
  'Roster & Player Development': ['rosterPlayers','playerDevelopmentHistory','developmentTransitions','graduatedPlayers','draftHistory'],
  'Awards & Honors': ['awardHistory','heismanHistory'],
  'Coach & Program History': ['coachCareers','coachProfiles','seasonArchives','recordHistory'],
  'Polls & Community': ['leaguePolls','notifications'],
  'League Rules': ['rules'],
  'Score Review Queue': ['pendingScoreReports']
};
const PRIVATE_KEY = /(?:password|secret|token|authorization|cookie|email|user.?id|discord.?id|guild.?id|channel.?id|message.?id|client.?secret|access.?key|api.?key|updated.?by|created.?by|modified.?by|actor.?id|actor.?tag)/i;
function publicFeatureValue(value, depth=0) {
  if (depth > 5 || value == null) return value == null ? null : undefined;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(v => publicFeatureValue(v, depth+1)).filter(v => v !== undefined);
  if (typeof value !== 'object') return undefined;
  const out = {};
  for (const [key, child] of Object.entries(value).slice(0, 80)) {
    if (PRIVATE_KEY.test(key) || key.startsWith('_')) continue;
    const clean = publicFeatureValue(child, depth+1);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}
function buildFeatureHub(dynasty, updatedAt) {
  const features = {};
  for (const [label, fields] of Object.entries(FEATURE_FIELDS)) {
    const entries = [];
    for (const field of fields) {
      const value = dynasty[field];
      if (Array.isArray(value) && value.length) entries.push({ source: field, items: publicFeatureValue(value) });
      else if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) entries.push({ source: field, items: publicFeatureValue(value) });
    }
    features[label] = entries;
  }
  return { dynasty: { id:String(dynasty.id||''), name:String(dynasty.name||'Unnamed Dynasty'), season:Number(dynasty.season||1), seasonYear:Number(dynasty.seasonYear||new Date().getFullYear()), currentWeek:Number(dynasty.currentWeek||0), phase:String(dynasty.currentPhaseLabel||dynasty.currentPhase||'Off-Season') }, features, updatedAt };
}

function appendAudit(event) {
  const records = readJsonArray(AUDIT_PATH, 'events');
  records.unshift({ id:crypto.randomUUID(), at:new Date().toISOString(), ...event });
  atomicJsonWrite(AUDIT_PATH, { events:records.slice(0,2000) }, { validate:v=>Array.isArray(v.events) });
}
function readJsonArray(file,key) { try { const data=JSON.parse(fs.readFileSync(file,'utf8')); return Array.isArray(data[key])?data[key]:[]; } catch { return []; } }
function getSession(req) {
  const sid=parseCookies(req.headers.cookie||'')[COOKIE_NAME]; if(!sid) return null;
  const s=sessions.get(sid); if(!s) return null;
  if(s.expiresAt<Date.now()) { sessions.delete(sid); return null; }
  s.expiresAt=Date.now()+SESSION_TTL_MS; return s;
}
function publicUser(s) { return s ? { id:s.user.id, username:s.user.username, globalName:s.user.global_name||s.user.username, avatar:s.user.avatar, roles:s.roles, isStaff:s.isStaff, isManager:s.isManager, csrfToken:s.csrfToken } : null; }
function requireAuth(req,res) { const s=getSession(req); if(!s) { send(res,401,{error:'Sign in with Discord to continue.'}); return null; } return s; }
function requireCsrf(req,res,s) { if(!safeEqual(req.headers['x-csrf-token'],s.csrfToken)) { send(res,403,{error:'Security token expired. Refresh the page and try again.'}); return false; } return true; }
function rateLimit(req,res,tag,limit=20,windowMs=60000) { const key=`${req.socket.remoteAddress||'unknown'}:${tag}`; const now=Date.now(); const old=rateLimits.get(key)||[]; const fresh=old.filter(t=>now-t<windowMs); if(fresh.length>=limit) { send(res,429,{error:'Too many requests. Please wait a moment and try again.'},'application/json; charset=utf-8',{'Retry-After':'60'}); return false; } fresh.push(now); rateLimits.set(key,fresh); return true; }
async function readBody(req, max=12_000) { let body=''; for await (const chunk of req) { body+=chunk; if(Buffer.byteLength(body)>max) throw Object.assign(new Error('Request body too large.'),{status:413}); } try { return JSON.parse(body||'{}'); } catch { throw Object.assign(new Error('Request body must be valid JSON.'),{status:400}); } }
function oauthConfig() { return { clientId:process.env.DISCORD_CLIENT_ID, clientSecret:process.env.DISCORD_CLIENT_SECRET, redirectUri:process.env.DISCORD_REDIRECT_URI, guildId:process.env.DISCORD_GUILD_ID }; }
function oauthReady() { const c=oauthConfig(); return Boolean(c.clientId&&c.clientSecret&&c.redirectUri&&c.guildId); }
async function discordJson(url, options={}) { const r=await fetch(url,{...options,headers:{'User-Agent':'BLACKLINE-Dynasty-Website/1.1','Content-Type':'application/json',...(options.headers||{})}}); const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.error_description||data.message||`Discord API returned ${r.status}`); return data; }
async function handleOAuthCallback(url,res) {
  const state=url.searchParams.get('state'); const stateData=oauthStates.get(state); oauthStates.delete(state);
  if(!stateData||stateData.expiresAt<Date.now()||!safeEqual(state,stateData.value)) return send(res,400,{error:'Discord sign-in expired. Please try again.'});
  if(url.searchParams.get('error')) return send(res,401,{error:'Discord sign-in was cancelled.'});
  const cfg=oauthConfig(); const form=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:cfg.redirectUri});
  try {
    const token=await discordJson('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
    const user=await discordJson('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});
    const member=await discordJson(`https://discord.com/api/users/@me/guilds/${encodeURIComponent(cfg.guildId)}/member`,{headers:{Authorization:`Bearer ${token.access_token}`}});
    const roles=Array.isArray(member.roles)?member.roles:[];
    const isStaff=roles.some(id=>STAFF_ROLE_IDS.has(id)); const isManager=roles.some(id=>MANAGER_ROLE_IDS.has(id))||isStaff;
    const sid=crypto.randomBytes(32).toString('hex'); const csrfToken=crypto.randomBytes(24).toString('hex');
    sessions.set(sid,{user:{id:user.id,username:user.username,global_name:user.global_name||null,avatar:user.avatar||null},roles,isStaff,isManager,csrfToken,expiresAt:Date.now()+SESSION_TTL_MS});
    appendAudit({type:'login',userId:user.id,username:user.username,role:isStaff?'staff':isManager?'manager':'member'});
    return send(res,302,'','text/plain; charset=utf-8',{'Location':'/','Set-Cookie':`${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS/1000}${isProduction?'; Secure':''}`});
  } catch(error) {
    const status=/404|Unknown Guild|Missing Access|403|401/i.test(error.message)?403:502;
    return send(res,status,{error:status===403?'Your Discord account must be a member of the configured BLACKLINE server to sign in.':'Discord sign-in could not be completed. Check the OAuth configuration and requested scopes.'});
  }
}
const server=http.createServer(async(req,res)=>{
  let url; try { url=new URL(req.url,`http://${req.headers.host||'localhost'}`); } catch { return send(res,400,{error:'Invalid URL.'}); }
  if(req.method==='GET'&&url.pathname==='/auth/discord') {
    if(!oauthReady()) return send(res,503,{error:'Discord sign-in is not configured yet. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI and DISCORD_GUILD_ID.'});
    if(!rateLimit(req,res,'oauth',10)) return;
    const state=crypto.randomBytes(24).toString('hex'); oauthStates.set(state,{value:state,expiresAt:Date.now()+5*60*1000});
    const c=oauthConfig(); const params=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:'identify guilds.members.read',state});
    return send(res,302,'','text/plain; charset=utf-8',{'Location':`https://discord.com/oauth2/authorize?${params}`});
  }
  if(req.method==='GET'&&url.pathname==='/auth/callback') return handleOAuthCallback(url,res);
  if(req.method==='POST'&&url.pathname==='/auth/logout') {
    const s=getSession(req); if(!s) return send(res,204,{});
    if(!requireCsrf(req,res,s)) return;
    sessions.delete(parseCookies(req.headers.cookie||'')[COOKIE_NAME]);
    res.writeHead(204, {'Cache-Control':'no-store','Set-Cookie':`${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isProduction?'; Secure':''}`}); return res.end();
  }

  if(req.method==='GET'&&url.pathname==='/auth/twitch') {
    const session=requireAuth(req,res); if(!session) return;
    const clientId=String(process.env.TWITCH_CLIENT_ID||'').trim();
    const redirectUri=String(process.env.TWITCH_OAUTH_REDIRECT_URI||'').trim();
    if(!clientId||!redirectUri) return send(res,503,{error:'Twitch account linking is not configured. Set TWITCH_CLIENT_ID and TWITCH_OAUTH_REDIRECT_URI.'});
    if(!rateLimit(req,res,`twitch-oauth:${session.user.id}`,8)) return;
    const state=crypto.randomBytes(32).toString('hex');
    twitchOauthStates.set(state,{userId:String(session.user.id),csrfToken:session.csrfToken,expiresAt:Date.now()+5*60*1000});
    const params=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'user:read:email',state});
    return send(res,302,'','text/plain; charset=utf-8',{'Location':`https://id.twitch.tv/oauth2/authorize?${params}`});
  }
  if(req.method==='GET'&&url.pathname==='/auth/twitch/callback') {
    const state=String(url.searchParams.get('state')||'');
    const pending=twitchOauthStates.get(state); twitchOauthStates.delete(state);
    if(!pending||pending.expiresAt<Date.now()) return send(res,400,{error:'Twitch connection expired. Return to your account panel and try again.'});
    const cookies=parseCookies(req.headers.cookie||''); const session=sessions.get(cookies[COOKIE_NAME]);
    if(!session||String(session.user.id)!==pending.userId||session.csrfToken!==pending.csrfToken) return send(res,403,{error:'Your sign-in session changed. Please sign in again and reconnect Twitch.'});
    if(url.searchParams.get('error')) return send(res,400,{error:'Twitch authorization was declined. You can try again from Creator Connections.'});
    const code=String(url.searchParams.get('code')||'');
    const clientId=String(process.env.TWITCH_CLIENT_ID||'').trim(), clientSecret=String(process.env.TWITCH_CLIENT_SECRET||'').trim(), redirectUri=String(process.env.TWITCH_OAUTH_REDIRECT_URI||'').trim();
    if(!code||!clientId||!clientSecret||!redirectUri) return send(res,503,{error:'Twitch OAuth is not fully configured.'});
    try {
      const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code,grant_type:'authorization_code',redirect_uri:redirectUri}),signal:AbortSignal.timeout(12000)});
      const token=await tokenResponse.json().catch(()=>({}));
      if(!tokenResponse.ok||!token.access_token) return send(res,502,{error:'Twitch could not complete authorization. Please try again.'});
      const userResponse=await fetch('https://api.twitch.tv/helix/users',{headers:{'Client-ID':clientId,Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(12000)});
      const payload=await userResponse.json().catch(()=>({}));
      if(!userResponse.ok||!payload.data||!payload.data[0]) return send(res,502,{error:'Could not verify the Twitch account returned by Twitch.'});
      const twitch=payload.data[0];
      const links=readJsonArray(TWITCH_LINKS_PATH,'links');
      const existing=links.find(x=>String(x.twitchId)===String(twitch.id)&&String(x.discordUserId)!==pending.userId);
      if(existing) return send(res,409,{error:'That Twitch account is already linked to another BLACKLINE member. Contact staff if this is a mistake.'});
      const record={discordUserId:pending.userId,twitchId:String(twitch.id),login:String(twitch.login||'').slice(0,25),displayName:String(twitch.display_name||twitch.login||'').slice(0,50),profileImageUrl:String(twitch.profile_image_url||'').startsWith('https://')?String(twitch.profile_image_url).slice(0,500):'',linkedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      const next=links.filter(x=>String(x.discordUserId)!==pending.userId); next.push(record);
      atomicJsonWrite(TWITCH_LINKS_PATH,{links:next},{validate:v=>Array.isArray(v.links)});
      appendAudit({type:'twitch_account_linked',userId:pending.userId,twitchId:record.twitchId});
      res.writeHead(302,{'Cache-Control':'no-store','Location':'/creator-connections.html?connected=1','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff'}); return res.end();
    } catch(error) { console.error('[website] Twitch OAuth failed:',String(error.message||error)); return send(res,502,{error:'Twitch connection could not be completed right now.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/my-twitch') {
    const session=requireAuth(req,res); if(!session) return;
    const link=readJsonArray(TWITCH_LINKS_PATH,'links').find(x=>String(x.discordUserId)===String(session.user.id));
    return send(res,200,{configured:Boolean(process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_CLIENT_SECRET&&process.env.TWITCH_OAUTH_REDIRECT_URI),connected:Boolean(link),account:link?{login:link.login,displayName:link.displayName,profileImageUrl:link.profileImageUrl,linkedAt:link.linkedAt}:null,csrfToken:session.csrfToken});
  }
  if(req.method==='DELETE'&&url.pathname==='/api/my-twitch') {
    const session=requireAuth(req,res); if(!session) return; if(!requireCsrf(req,res,session)) return;
    const links=readJsonArray(TWITCH_LINKS_PATH,'links'); const next=links.filter(x=>String(x.discordUserId)!==String(session.user.id));
    if(next.length!==links.length) { atomicJsonWrite(TWITCH_LINKS_PATH,{links:next},{validate:v=>Array.isArray(v.links)}); appendAudit({type:'twitch_account_unlinked',userId:session.user.id}); }
    return send(res,200,{connected:false});
  }
  if(req.method==='GET'&&url.pathname==='/api/health') return send(res,200,{ok:true,dataConnected:Boolean(readDynasties()),authConfigured:oauthReady(),mode:'live-public-data + authenticated-request-queue'});
  if(req.method==='GET'&&url.pathname==='/api/stream-status') {
    const streams=readJsonArray(STREAM_STATUS_PATH,'streams').filter(x=>x&&x.live===true).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,100).map(x=>({platform:String(x.platform||''),channel:String(x.channel||''),title:String(x.title||'Live now').slice(0,160),url:String(x.url||''),startedAt:x.startedAt||null,updatedAt:x.updatedAt||null}));
    return send(res,200,{streams,configured:Boolean(process.env.STREAM_STATUS_WEBHOOK_SECRET)});
  }
  // Trusted stream monitor webhook. Provider polling/EventSub workers can publish status
  // here without exposing platform credentials to the browser.
  if(req.method==='POST'&&url.pathname==='/api/stream-status') {
    const secret=String(process.env.STREAM_STATUS_WEBHOOK_SECRET||'');
    if(!secret) return send(res,503,{error:'Stream status webhook is not configured.'});
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')||!safeEqual(auth.slice(7),secret)) return send(res,401,{error:'Unauthorized stream status publisher.'});
    if(!rateLimit(req,res,'stream-status-webhook',120)) return;
    try {
      const body=await readBody(req,5000); const platform=String(body.platform||'').toLowerCase();
      const allowedHosts={twitch:'twitch.tv',kick:'kick.com',youtube:'youtube.com'};
      if(!Object.hasOwn(allowedHosts,platform)) return send(res,400,{error:'Platform must be twitch, kick, or youtube.'});
      const channel=String(body.channel||'').trim().slice(0,100);
      if(!channel) return send(res,400,{error:'Channel is required.'});
      if(typeof body.live!=='boolean') return send(res,400,{error:'Live must be a boolean.'});
      let streamUrl='';
      if(body.live) { try { const u=new URL(String(body.url||'')); if(u.protocol!=='https:'||!(u.hostname===allowedHosts[platform]||u.hostname.endsWith('.'+allowedHosts[platform]))||u.username||u.password) throw new Error(); streamUrl=u.toString(); } catch { return send(res,400,{error:'A valid HTTPS channel URL is required while live.'}); } }
      const streams=readJsonArray(STREAM_STATUS_PATH,'streams'); const key=`${platform}:${channel.toLowerCase()}`; const index=streams.findIndex(x=>`${x.platform}:${String(x.channel||'').toLowerCase()}`===key); const previous=index>=0?streams[index]:null;
      if(body.live) { const item={platform,channel,title:String(body.title||'Live now').trim().slice(0,160)||'Live now',url:streamUrl,live:true,startedAt:previous&&previous.live?previous.startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; if(index>=0) streams[index]=item; else streams.push(item); }
      else if(index>=0) streams.splice(index,1);
      atomicJsonWrite(STREAM_STATUS_PATH,{streams:streams.slice(-1000)},{validate:v=>Array.isArray(v.streams)});
      let discordAnnouncement='not-needed';
      // Announce only an offline -> live transition, preventing repeated monitor polls from spamming Discord.
      if(body.live && !(previous && previous.live)) {
        const hook=String(process.env.DISCORD_STREAM_WEBHOOK_URL||'');
        if(hook) {
          try {
            const hookUrl=new URL(hook);
            if(hookUrl.protocol!=='https:' || !['discord.com','discordapp.com'].includes(hookUrl.hostname) || !hookUrl.pathname.startsWith('/api/webhooks/')) throw new Error('Invalid Discord webhook URL');
            const response=await fetch(hookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed_mentions:{parse:[]},embeds:[{title:`🔴 ${channel} is live!`,description:String(body.title||'Live now').trim().slice(0,160)||'Live now',url:streamUrl,color:0xE74C3C,fields:[{name:'Platform',value:platform,inline:true}],timestamp:new Date().toISOString()}]})});
            discordAnnouncement=response.ok?'sent':'failed';
            if(!response.ok) console.error('[website] Discord stream announcement failed with HTTP',response.status);
          } catch(error) { discordAnnouncement='failed'; console.error('[website] Discord stream announcement failed:',error.message); }
        } else discordAnnouncement='not-configured';
      }
      appendAudit({type:'stream_status_updated',platform,channel,live:body.live,discordAnnouncement});
      return send(res,200,{ok:true,live:body.live,discordAnnouncement});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not update stream status.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/creators') {
    const profiles=readJsonArray(CREATOR_PROFILES_PATH,'profiles')
      .filter(p=>String(p.displayName||'').trim())
      .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))
      .slice(0,500)
      .map(p=>({displayName:String(p.displayName).slice(0,60),bio:String(p.bio||'').slice(0,280),platforms:p.platforms&&typeof p.platforms==='object'?Object.fromEntries(['twitch','kick','youtube','other'].filter(k=>typeof p.platforms[k]==='string').map(k=>[k,p.platforms[k]])):{},updatedAt:p.updatedAt||null}));
    return send(res,200,{creators:profiles});
  }
  if(req.method==='GET'&&url.pathname==='/api/creator/profile') {
    const s=requireAuth(req,res); if(!s) return;
    const profiles=readJsonArray(CREATOR_PROFILES_PATH,'profiles');
    const profile=profiles.find(p=>String(p.userId)===String(s.user.id))||{displayName:String(s.user.global_name||s.user.username||'').slice(0,60),bio:'',platforms:{}};
    return send(res,200,{profile:{displayName:profile.displayName,bio:profile.bio,platforms:profile.platforms||{}}});
  }
  if(req.method==='PUT'&&url.pathname==='/api/creator/profile') {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,'creator-profile',10)) return;
    try {
      const body=await readBody(req,6000); const displayName=String(body.displayName||'').trim(); const bio=String(body.bio||'').trim();
      if(!displayName||displayName.length>60) return send(res,400,{error:'Display name must be 1–60 characters.'});
      if(bio.length>280) return send(res,400,{error:'Bio must be 280 characters or fewer.'});
      const allowed={twitch:'twitch.tv',kick:'kick.com',youtube:'youtube.com',other:'streamable.com'}; const platforms={};
      for(const [key,host] of Object.entries(allowed)) { const raw=String(body.platforms?.[key]||'').trim(); if(!raw) continue; let parsed; try { parsed=new URL(raw); } catch { return send(res,400,{error:`Enter a valid HTTPS ${key} profile URL.`}); } if(parsed.protocol!=='https:'||!(parsed.hostname===host||parsed.hostname.endsWith('.'+host))||parsed.username||parsed.password) return send(res,400,{error:`Use a valid HTTPS ${host} profile URL.`}); platforms[key]=parsed.toString(); }
      const profiles=readJsonArray(CREATOR_PROFILES_PATH,'profiles'); const userId=String(s.user.id); const item={userId,displayName,bio,platforms,updatedAt:new Date().toISOString()}; const index=profiles.findIndex(p=>String(p.userId)===userId); if(index>=0) profiles[index]=item; else profiles.push(item);
      atomicJsonWrite(CREATOR_PROFILES_PATH,{profiles:profiles.slice(-5000)},{validate:v=>Array.isArray(v.profiles)}); appendAudit({type:'creator_profile_updated',userId}); return send(res,200,{profile:{displayName,bio,platforms,updatedAt:item.updatedAt}});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not save creator profile.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/community/posts') {
    const posts=readJsonArray(COMMUNITY_PATH,'posts').filter(p=>p.status==='published').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
    return send(res,200,{posts});
  }
  const communityLikeMatch = url.pathname.match(/^\/api\/community\/posts\/([^/]+)\/like$/);
  if(req.method==='POST'&&communityLikeMatch) {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,'community-like',30)) return;
    const postId=decodeURIComponent(communityLikeMatch[1]);
    const posts=readJsonArray(COMMUNITY_PATH,'posts'); const post=posts.find(p=>p.id===postId&&p.status==='published');
    if(!post) return send(res,404,{error:'Post not found.'});
    if(!Array.isArray(post.likes)) post.likes=[];
    const userId=String(s.user.id); const index=post.likes.indexOf(userId); const liked=index<0;
    if(liked) post.likes.push(userId); else post.likes.splice(index,1);
    atomicJsonWrite(COMMUNITY_PATH,{posts},{validate:v=>Array.isArray(v.posts)});
    appendAudit({type:liked?'community_post_liked':'community_post_unliked',postId,userId});
    return send(res,200,{postId,liked,likeCount:post.likes.length});
  }
  if(req.method==='POST'&&url.pathname==='/api/community/posts') {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,'community-post',8)) return;
    try { const body=await readBody(req,8000); const content=String(body.content||'').trim(); const clipUrl=String(body.clipUrl||'').trim();
      if(!content && !clipUrl) return send(res,400,{error:'Write a post or add a clip link.'});
      if(content.length>2000) return send(res,400,{error:'Posts must be 2,000 characters or fewer.'});
      if(clipUrl && (!/^https:\/\//i.test(clipUrl) || clipUrl.length>500)) return send(res,400,{error:'Clip links must be valid HTTPS URLs.'});
      const posts=readJsonArray(COMMUNITY_PATH,'posts'); const item={id:crypto.randomUUID(),content,clipUrl,likes:[],createdAt:new Date().toISOString(),status:'published',author:{id:s.user.id,username:String(s.user.global_name||s.user.username||'BLACKLINE member').slice(0,80),avatar:s.user.avatar||null}};
      posts.unshift(item); atomicJsonWrite(COMMUNITY_PATH,{posts:posts.slice(0,2000)},{validate:v=>Array.isArray(v.posts)}); appendAudit({type:'community_post_created',postId:item.id,userId:s.user.id}); return send(res,201,{post:item});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not publish this post safely.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/me') { const s=getSession(req); return send(res,200,{user:publicUser(s),authConfigured:oauthReady()}); }
  if(req.method==='GET'&&url.pathname==='/api/dynasties') {
    const dynasties=readDynasties(); if(!dynasties) return send(res,503,{error:'Dynasty data is not available. Confirm data/dynasties.json exists or set DYNASTY_DATA_PATH.'});
    return send(res,200,{dynasties,updatedAt:new Date().toISOString()});
  }
  const featuresMatch = url.pathname.match(/^\/api\/dynasties\/([^/]+)\/features$/);
  if(req.method==='GET'&&featuresMatch) {
    try {
      const raw=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
      if(!Array.isArray(raw.dynasties)) throw new Error('Invalid dynasty database');
      const id=decodeURIComponent(featuresMatch[1]);
      const dynasty=raw.dynasties.find(d=>String(d.id||'')===id);
      if(!dynasty) return send(res,404,{error:'Dynasty not found.'});
      return send(res,200,buildFeatureHub(dynasty,fs.statSync(DATA_PATH).mtime.toISOString()));
    } catch(error) {
      if(error.code==='ENOENT') return send(res,503,{error:'Dynasty data is not available.'});
      console.error('[website] Feature hub read failed:',error.message);
      return send(res,503,{error:'Feature data is temporarily unavailable.'});
    }
  }
  const workspaceMatch = url.pathname.match(/^\/api\/dynasties\/([^/]+)\/workspace$/);
  if(req.method==='GET'&&workspaceMatch) {
    try { const raw=JSON.parse(fs.readFileSync(DATA_PATH,'utf8')); if(!Array.isArray(raw.dynasties)) throw new Error('Invalid dynasty database');
      const id=decodeURIComponent(workspaceMatch[1]); const dynasty=raw.dynasties.find(d=>String(d.id||'')===id);
      if(!dynasty) return send(res,404,{error:'Dynasty not found.'});
      return send(res,200,buildWorkspace(dynasty,fs.statSync(DATA_PATH).mtime.toISOString()));
    } catch(error) { if(error.code==='ENOENT') return send(res,503,{error:'Dynasty data is not available.'}); console.error('[website] Workspace read failed:',error.message); return send(res,503,{error:'League workspace data is temporarily unavailable.'}); }
  }
  if(req.method==='POST'&&url.pathname==='/api/team-claims') {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,`team-claims:${s.user.id}`,5)) return;
    try {
      const body=await readBody(req); const dynastyId=String(body.dynastyId||'').trim(); const team=String(body.team||'').trim();
      if(!dynastyId||!team||team.length>100) return send(res,400,{error:'Choose a dynasty and a valid team.'});
      const raw=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
      const dynasty=raw.dynasties.find(d=>String(d.id||'')===dynastyId);
      if(!dynasty) return send(res,404,{error:'Dynasty not found.'});
      const coach=(Array.isArray(dynasty.coaches)?dynasty.coaches:[]).find(c=>String(c.userId||c.discordId||c.discordUserId||'')===String(s.user.id));
      if(!coach) return send(res,403,{error:'You must be a registered coach in this dynasty before claiming a team.'});
      const teams=require('../utils/teams').getTeamsForDynasty(dynasty);
      if(!teams.includes(team)) return send(res,400,{error:'That team is not available in this dynasty’s team pool.'});
      const action={id:crypto.randomUUID(),type:'team-claim',status:'queued',dynastyId,team,actor:{id:s.user.id,username:s.user.username},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:null};
      const file=path.join(ACTIONS_PATH,`${action.id}.json`);
      atomicJsonWrite(file,action,{validate:v=>v&&v.type==='team-claim'&&v.status==='queued'&&typeof v.id==='string'});
      appendAudit({type:'team_claim_queued',actionId:action.id,userId:s.user.id,dynastyId,team});
      return send(res,202,{action:{id:action.id,status:action.status,team:action.team,dynastyId:action.dynastyId}});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not safely queue the team claim.'}); }
  }
  if(req.method==='POST'&&url.pathname==='/api/recruiting-actions') {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,`recruiting-actions:${s.user.id}`,8)) return;
    try {
      const body=await readBody(req); const dynastyId=String(body.dynastyId||'').trim(); const name=String(body.name||'').trim(); const team=String(body.team||'').trim(); const position=String(body.position||'').trim().toUpperCase(); const stars=Number(body.stars); const status=String(body.status||'Interested').trim();
      const positions=['QB','RB','WR','TE','OL','DL','EDGE','LB','CB','S','K','P','ATH','Other'];
      if(!dynastyId||!name||name.length>100||!team||team.length>100||!positions.includes(position)||!Number.isInteger(stars)||stars<1||stars>5||!['Interested','Offered','Visiting','Committed'].includes(status)) return send(res,400,{error:'Provide a prospect name, team, valid position, 1–5 stars, and a permitted recruiting status.'});
      const raw=JSON.parse(fs.readFileSync(DATA_PATH,'utf8')); const dynasty=(raw.dynasties||[]).find(d=>String(d.id||'')===dynastyId);
      if(!dynasty) return send(res,404,{error:'Dynasty not found.'});
      const coach=(Array.isArray(dynasty.coaches)?dynasty.coaches:[]).find(c=>String(c.userId||c.discordId||c.discordUserId||'')===String(s.user.id));
      if(!coach) return send(res,403,{error:'You must be a registered coach in this dynasty to submit recruiting updates.'});
      const assigned=(Array.isArray(dynasty.teamSelections)?dynasty.teamSelections:[]).filter(x=>String(x.userId||x.coachId||x.discordId||'')===String(s.user.id)).map(x=>String(x.team||x.teamName||'').trim().toLowerCase());
      if(!assigned.includes(team.toLowerCase())) return send(res,403,{error:'You can only manage recruiting prospects for your own assigned team.'});
      const action={id:crypto.randomUUID(),type:'recruiting-prospect',status:'queued',dynastyId,season:Number(dynasty.season||1),name,team,position,stars,prospectStatus:status,actor:{id:s.user.id,username:s.user.username},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:null};
      const file=path.join(ACTIONS_PATH,`${action.id}.json`); atomicJsonWrite(file,action,{validate:v=>v&&v.type==='recruiting-prospect'&&v.status==='queued'&&typeof v.id==='string'});
      appendAudit({type:'recruiting_action_queued',actionId:action.id,userId:s.user.id,dynastyId,team,season:action.season,status});
      return send(res,202,{action:{id:action.id,status:action.status,type:action.type,dynastyId,team,season:action.season}});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not safely queue the recruiting update.'}); }
  }
  if(req.method==='POST'&&url.pathname==='/api/score-reports') {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,`score-reports:${s.user.id}`,5)) return;
    try {
      const body=await readBody(req); const dynastyId=String(body.dynastyId||'').trim(); const homeTeam=String(body.homeTeam||'').trim(); const awayTeam=String(body.awayTeam||'').trim();
      const week=Number(body.week), homeScore=Number(body.homeScore), awayScore=Number(body.awayScore);
      if(!dynastyId||!homeTeam||!awayTeam||homeTeam.length>80||awayTeam.length>80||homeTeam.toLowerCase()===awayTeam.toLowerCase()||!Number.isInteger(week)||week<0||week>15||!Number.isInteger(homeScore)||homeScore<0||homeScore>300||!Number.isInteger(awayScore)||awayScore<0||awayScore>300) return send(res,400,{error:'Provide a dynasty, two different team names, week 0–15, and whole-number scores from 0–300.'});
      const raw=JSON.parse(fs.readFileSync(DATA_PATH,'utf8')); const dynasty=(raw.dynasties||[]).find(d=>String(d.id||'')===dynastyId);
      if(!dynasty) return send(res,404,{error:'Dynasty not found.'});
      const coach=(Array.isArray(dynasty.coaches)?dynasty.coaches:[]).find(c=>String(c.userId||c.discordId||c.discordUserId||'')===String(s.user.id));
      if(!coach) return send(res,403,{error:'You must be a registered coach in this dynasty to report scores.'});
      const selections=(Array.isArray(dynasty.teamSelections)?dynasty.teamSelections:[]).filter(x=>String(x.userId||x.coachId||x.discordId||'')===String(s.user.id)).map(x=>String(x.team||x.teamName||'').trim().toLowerCase());
      if(!selections.includes(homeTeam.toLowerCase())&&!selections.includes(awayTeam.toLowerCase())) return send(res,403,{error:'Your assigned team must be part of the reported matchup.'});
      if(Number(dynasty.season||1)<1) return send(res,409,{error:'This dynasty does not have a valid active season.'});
      const action={id:crypto.randomUUID(),type:'score-report',status:'queued',dynastyId,season:Number(dynasty.season||1),week,homeTeam,awayTeam,homeScore,awayScore,actor:{id:s.user.id,username:s.user.username},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),result:null};
      fs.mkdirSync(ACTIONS_PATH,{recursive:true}); const file=path.join(ACTIONS_PATH,`${action.id}.json`);
      atomicJsonWrite(file,action,{validate:v=>v&&v.type==='score-report'&&v.status==='queued'&&typeof v.id==='string'});
      appendAudit({type:'score_report_queued',actionId:action.id,userId:s.user.id,dynastyId,week,homeTeam,awayTeam});
      return send(res,202,{action:{id:action.id,status:action.status,type:action.type,dynastyId,week,homeTeam,awayTeam}});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not safely queue the score report.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/my-actions') {
    const s=requireAuth(req,res); if(!s) return;
    let actions=[]; try { actions=fs.readdirSync(ACTIONS_PATH).filter(n=>n.endsWith('.json')).map(n=>{try{return JSON.parse(fs.readFileSync(path.join(ACTIONS_PATH,n),'utf8'));}catch{return null;}}).filter(a=>a&&String(a.actor?.id||'')===String(s.user.id)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100).map(a=>({id:a.id,type:a.type,status:a.status,dynastyId:a.dynastyId,team:a.team,week:a.week,homeTeam:a.homeTeam,awayTeam:a.awayTeam,homeScore:a.homeScore,awayScore:a.awayScore,name:a.name,prospectStatus:a.prospectStatus||null,position:a.position,stars:a.stars,createdAt:a.createdAt,updatedAt:a.updatedAt,result:a.result})); } catch(error) { if(error.code!=='ENOENT') throw error; }
    return send(res,200,{actions});
  }
  if(req.method==='GET'&&url.pathname==='/api/me/dashboard') {
    const s=requireAuth(req,res); if(!s) return;
    try {
      const stat=fs.statSync(DATA_PATH); const raw=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
      if(!raw||!Array.isArray(raw.dynasties)) throw new Error('Invalid dynasty database.');
      const memberships=[];
      for(const d of raw.dynasties) {
        const coach=(Array.isArray(d.coaches)?d.coaches:[]).find(c=>String(c.userId||c.discordId||c.discordUserId||'')===String(s.user.id));
        if(!coach) continue;
        const selected=(Array.isArray(d.teamSelections)?d.teamSelections:[]).filter(x=>String(x.userId||x.coachId||x.discordId||'')===String(s.user.id) || String(x.username||x.coachName||'').toLowerCase()===String(coach.username||'').toLowerCase());
        memberships.push({dynastyId:String(d.id||''),dynastyName:String(d.name||'Unnamed Dynasty'),status:String(d.status||'active'),season:Number(d.season||1),seasonYear:Number(d.seasonYear||new Date().getFullYear()),currentWeek:Number(d.currentWeek||0),currentPhaseLabel:String(d.currentPhaseLabel||d.currentPhase||'Off-Season'),coachName:String(coach.username||s.user.global_name||s.user.username),teamAssignments:selected.map(x=>String(x.team||x.teamName||'Team TBD')).slice(0,10),timezone:String(coach.timezone||'Not set')});
      }
      return send(res,200,{memberships,updatedAt:stat.mtime.toISOString()});
    } catch(error) { console.error('[website] Coach dashboard unavailable:',error.message); return send(res,503,{error:'Coach dashboard data is temporarily unavailable.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/my-requests') {
    const s=requireAuth(req,res); if(!s) return;
    const requests=readJsonArray(REQUESTS_PATH,'requests').filter(r=>String(r.submittedBy?.id||'')===String(s.user.id)).slice(0,100).map(r=>({id:r.id,type:r.type,title:r.title,dynastyId:r.dynastyId,moduleId:r.moduleId,createdAt:r.createdAt,status:r.status,reviewedAt:r.reviewedAt,reviewNote:r.reviewNote||''}));
    return send(res,200,{requests});
  }
  if(req.method==='POST'&&url.pathname==='/api/requests') {
    const s=requireAuth(req,res); if(!s) return; if(!requireCsrf(req,res,s)) return; if(!rateLimit(req,res,`requests:${s.user.id}`,8)) return;
    try {
      const body=await readBody(req); const type=String(body.type||'support'); const title=String(body.title||'').trim(); const details=String(body.details||'').trim(); const dynastyId=String(body.dynastyId||'').trim(); const moduleId=String(body.moduleId||'').trim().slice(0,60);
      if(!['support','team-claim','league-issue','feature','schedule','score-report','recruiting','roster','awards','playoffs','staff-action','data-recovery','panel-repair','dispute','poll'].includes(type)) return send(res,400,{error:'Unsupported request type.'});
      if(title.length<3||title.length>100||details.length<5||details.length>2000) return send(res,400,{error:'Enter a title (3–100 characters) and details (5–2,000 characters).'});
      const dynasties=readDynasties()||[]; if(dynastyId&&!dynasties.some(d=>d.id===dynastyId)) return send(res,400,{error:'That dynasty could not be found.'});
      const requests=readJsonArray(REQUESTS_PATH,'requests'); const item={id:crypto.randomUUID(),type,title,details,dynastyId,moduleId,createdAt:new Date().toISOString(),status:'pending',submittedBy:{id:s.user.id,username:s.user.username},reviewedBy:null,reviewedAt:null};
      requests.unshift(item); atomicJsonWrite(REQUESTS_PATH,{requests:requests.slice(0,5000)},{validate:v=>Array.isArray(v.requests)});
      appendAudit({type:'request_submitted',requestId:item.id,userId:s.user.id,requestType:type,dynastyId});
      return send(res,201,{request:{id:item.id,status:item.status,createdAt:item.createdAt}});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not save the request safely.'}); }
  }
  if(req.method==='GET'&&url.pathname==='/api/requests') {
    const s=requireAuth(req,res); if(!s) return; if(!s.isStaff) return send(res,403,{error:'Staff permission is required.'});
    return send(res,200,{requests:readJsonArray(REQUESTS_PATH,'requests').slice(0,300)});
  }
  if(req.method==='PATCH'&&url.pathname.startsWith('/api/requests/')) {
    const s=requireAuth(req,res); if(!s) return; if(!s.isStaff) return send(res,403,{error:'Staff permission is required.'}); if(!requireCsrf(req,res,s)) return;
    try { const id=decodeURIComponent(url.pathname.slice('/api/requests/'.length)); const body=await readBody(req); if(!['pending','in-review','approved','rejected','completed'].includes(body.status)) return send(res,400,{error:'Invalid request status.'});
      const requests=readJsonArray(REQUESTS_PATH,'requests'); const item=requests.find(r=>r.id===id); if(!item) return send(res,404,{error:'Request not found.'});
      item.status=body.status; item.reviewedBy=s.user.id; item.reviewedAt=new Date().toISOString(); item.reviewNote=String(body.note||'').slice(0,500);
      atomicJsonWrite(REQUESTS_PATH,{requests},{validate:v=>Array.isArray(v.requests)}); appendAudit({type:'request_status_changed',requestId:id,userId:s.user.id,status:item.status}); return send(res,200,{request:{id:item.id,status:item.status}});
    } catch(error) { return send(res,error.status||500,{error:error.status?error.message:'Could not update request safely.'}); }
  }
  let requestPath; try { requestPath=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname); } catch { return send(res,400,'Bad request','text/plain; charset=utf-8'); }
  const filePath=path.resolve(PUBLIC,`.${requestPath}`);
  if(!filePath.startsWith(PUBLIC+path.sep)) return send(res,403,'Forbidden','text/plain; charset=utf-8');
  fs.readFile(filePath,(err,data)=>{ if(err) return send(res,404,'Not found','text/plain; charset=utf-8'); send(res,200,data,MIME[path.extname(filePath)]||'application/octet-stream'); });
});
server.listen(PORT,()=>{ console.log(`BLACKLINE website running at http://localhost:${PORT}`); console.log(`Dynasty data: ${DATA_PATH}`); console.log(`Discord OAuth configured: ${oauthReady()?'yes':'no (public read-only mode)'}`); if(!readDynasties()) console.warn('[website] Dynasty data unavailable; confirm the bot data file path.'); if(!STAFF_ROLE_IDS.size) console.warn('[website] BLACKLINE_STAFF_ROLE_IDS is empty; staff-only request review is disabled for all users.'); });
