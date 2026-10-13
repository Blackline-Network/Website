'use strict';

function normalizeTeam(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function validScore(game) {
  return game?.status === 'final' && Number.isFinite(game.homeScore) && Number.isFinite(game.awayScore) &&
    game.homeScore >= 0 && game.awayScore >= 0 && normalizeTeam(game.homeTeam) && normalizeTeam(game.awayTeam) &&
    normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam);
}

function buildConferenceChampionshipRace(dynasty, { season = dynasty?.season } = {}) {
  const targetSeason = Number(season);
  const conferences = dynasty?.teamConferences && !Array.isArray(dynasty.teamConferences) ? dynasty.teamConferences : {};
  const teamEntries = Object.entries(conferences)
    .map(([team, conference]) => ({ team: String(team ?? '').trim(), conference: String(conference ?? '').trim() }))
    .filter(row => row.team && row.conference);
  const conferenceFor = team => teamEntries.find(row => normalizeTeam(row.team) === normalizeTeam(team))?.conference || '';
  const rows = new Map();
  const ensure = (team, conference = conferenceFor(team)) => {
    const key = `${normalizeTeam(conference)}::${normalizeTeam(team)}`;
    if (!team || !conference) return null;
    if (!rows.has(key)) rows.set(key, {
      team: String(team).trim(), conference, wins: 0, losses: 0, ties: 0, games: 0,
      pointsFor: 0, pointsAgainst: 0, conferencePointsFor: 0, conferencePointsAgainst: 0, overallWins: 0, overallLosses: 0, overallTies: 0,
      overallGames: 0, remainingConferenceGames: 0
    });
    return rows.get(key);
  };
  for (const row of teamEntries) ensure(row.team, row.conference);
  const games = (Array.isArray(dynasty?.scheduleGames) ? dynasty.scheduleGames : [])
    .filter(game => Number(game?.season) === targetSeason && normalizeTeam(game?.homeTeam) && normalizeTeam(game?.awayTeam) &&
      normalizeTeam(game.homeTeam) !== normalizeTeam(game.awayTeam));

  for (const game of games) {
    const homeConference = conferenceFor(game.homeTeam);
    const awayConference = conferenceFor(game.awayTeam);
    const home = ensure(game.homeTeam, homeConference);
    const away = ensure(game.awayTeam, awayConference);
    if (validScore(game)) {
      if (home) {
        home.overallGames++; home.pointsFor += game.homeScore; home.pointsAgainst += game.awayScore;
        if (game.homeScore > game.awayScore) home.overallWins++;
        else if (game.homeScore < game.awayScore) home.overallLosses++;
        else home.overallTies++;
      }
      if (away) {
        away.overallGames++; away.pointsFor += game.awayScore; away.pointsAgainst += game.homeScore;
        if (game.awayScore > game.homeScore) away.overallWins++;
        else if (game.awayScore < game.homeScore) away.overallLosses++;
        else away.overallTies++;
      }
      if (home && away && homeConference && normalizeTeam(homeConference) === normalizeTeam(awayConference)) {
        home.games++; away.games++;
        home.conferencePointsFor += game.homeScore; home.conferencePointsAgainst += game.awayScore;
        away.conferencePointsFor += game.awayScore; away.conferencePointsAgainst += game.homeScore;
        if (game.homeScore > game.awayScore) { home.wins++; away.losses++; }
        else if (game.homeScore < game.awayScore) { away.wins++; home.losses++; }
        else { home.ties++; away.ties++; }
      }
    } else if (game.status !== 'final' && home && away && homeConference && normalizeTeam(homeConference) === normalizeTeam(awayConference)) {
      home.remainingConferenceGames++; away.remainingConferenceGames++;
    }
  }

  const pct = row => row.games ? (row.wins + row.ties * 0.5) / row.games : 0;
  const overallPct = row => row.overallGames ? (row.overallWins + row.overallTies * 0.5) / row.overallGames : 0;
  const standings = [...rows.values()].map(row => ({
    ...row,
    conferenceWinPercentage: pct(row),
    overallWinPercentage: overallPct(row),
    conferencePointDifferential: row.conferencePointsFor - row.conferencePointsAgainst,
    record: `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ''}`,
    overallRecord: `${row.overallWins}-${row.overallLosses}${row.overallTies ? `-${row.overallTies}` : ''}`
  })).sort((a, b) => normalizeTeam(a.conference).localeCompare(normalizeTeam(b.conference)) ||
    b.conferenceWinPercentage - a.conferenceWinPercentage ||
    b.conferencePointDifferential - a.conferencePointDifferential ||
    b.pointsFor - a.pointsFor || a.team.localeCompare(b.team));

  const conferenceGroups = new Map();
  for (const row of standings) {
    if (!conferenceGroups.has(normalizeTeam(row.conference))) conferenceGroups.set(normalizeTeam(row.conference), { conference: row.conference, standings: [] });
    conferenceGroups.get(normalizeTeam(row.conference)).standings.push(row);
  }
  const recordedChampions = Array.isArray(dynasty?.conferenceChampionsHistory) ? dynasty.conferenceChampionsHistory : [];
  const races = [...conferenceGroups.values()].map(group => {
    const championRecord = recordedChampions.find(item => Number(item?.season) === targetSeason &&
      normalizeTeam(item?.conference || item?.detail) === normalizeTeam(group.conference) &&
      normalizeTeam(item?.champion || item?.team));
    const leader = group.standings[0] || null;
    const tiedAtTop = leader ? group.standings.filter(row => row.conferenceWinPercentage === leader.conferenceWinPercentage && row.conferencePointDifferential === leader.conferencePointDifferential).length > 1 : false;
    return { ...group, leader, recordedChampion: championRecord ? (championRecord.champion || championRecord.team) : null, tiedAtTop,
      scheduledConferenceGamesRemaining: group.standings.reduce((sum, row) => sum + row.remainingConferenceGames, 0) / 2,
      hasRecordedConferenceResults: group.standings.some(row => row.games > 0) };
  }).sort((a, b) => normalizeTeam(a.conference).localeCompare(normalizeTeam(b.conference)));

  return { season: targetSeason, races, gamesConsidered: games.filter(validScore).length,
    assignedTeams: teamEntries.length, scheduleIsClosed: Boolean(dynasty?.seasonClosed) };
}

module.exports = { buildConferenceChampionshipRace, normalizeTeam };
