'use strict';
const { buildDynastyRecordBook } = require('./recordBook');
const { buildAwardLeaders } = require('./awardLeaders');
const { buildPlayerCareerRecords } = require('./playerCareerRecords');
const { buildProgramEvolutionIndex } = require('./programEvolution');
const { buildProgramHallOfFame } = require('./programHallOfFame');
const { buildCoachHallOfFame } = require('./coachHallOfFame');
const { buildRecruitingClassArchive } = require('./recruitingRankings');

function arr(value) { return Array.isArray(value) ? value : []; }
function buildDynastyAlmanac(dynasty = {}) {
  const recordBook = buildDynastyRecordBook(dynasty);
  const awards = buildAwardLeaders(dynasty);
  const careers = buildPlayerCareerRecords(dynasty);
  const programs = buildProgramEvolutionIndex(dynasty);
  const programHall = buildProgramHallOfFame(dynasty);
  const coachHall = buildCoachHallOfFame(dynasty);
  let recruitingArchive = { seasons: [], classes: [], note: 'Recruiting class archive unavailable.' };
  try { recruitingArchive = buildRecruitingClassArchive(dynasty) || recruitingArchive; } catch (_) { /* Keep Almanac available if optional recruiting history is malformed. */ }
  const nationalTitles = arr(dynasty.championshipHistory).filter(row => String(row?.champion || '').trim());
  const conferenceTitles = arr(dynasty.conferenceChampionsHistory).filter(row => String(row?.champion || row?.team || row?.winner || '').trim());
  const draftRecords = arr(dynasty.draftHistory).filter(row => String(row?.player || row?.winner || row?.recipient || '').trim() && Number.isFinite(Number(row?.season)) && Number(row.season) >= 1);
  const seasons = new Set([
    ...arr(dynasty.scheduleGames).filter(g => g?.status === 'final' && Number.isFinite(Number(g.season))).map(g => Number(g.season)),
    ...nationalTitles.map(r => Number(r.season)).filter(Number.isFinite),
    ...conferenceTitles.map(r => Number(r.season)).filter(Number.isFinite),
    ...arr(dynasty.heismanHistory).map(r => Number(r?.season)).filter(n => Number.isFinite(n) && n >= 1),
    ...arr(dynasty.awardHistory).map(r => Number(r?.season)).filter(n => Number.isFinite(n) && n >= 1)
  ]);
  const latestChampion = nationalTitles.slice().sort((a,b) => Number(b.season)-Number(a.season))[0] || null;
  const topProgram = recordBook.careerLeaders[0] || null;
  const topAwardRecipient = awards.recipientLeaders[0] || null;
  const topCoach = arr(coachHall.coaches).sort((a,b) => Number(a.rank || 9999)-Number(b.rank || 9999))[0] || null;
  const topProgramHall = arr(programHall.programs).sort((a,b) => Number(a.rank || 9999)-Number(b.rank || 9999))[0] || null;
  const recruitingClasses = arr(recruitingArchive.classes || recruitingArchive.seasons);
  return {
    coverage: {
      programs: programs.length,
      finalizedGames: recordBook.gamesReviewed,
      seasons: seasons.size,
      nationalTitles: nationalTitles.length,
      conferenceTitles: conferenceTitles.length,
      awardRecords: awards.validRecords,
      playerCareerRecords: careers.validRecords,
      draftRecords: draftRecords.length,
      recruitingClassRecords: recruitingClasses.length,
      coachHallEntries: arr(coachHall.coaches).length,
      programHallEntries: arr(programHall.programs).length
    },
    highlights: {
      latestChampion: latestChampion ? { team: latestChampion.champion, season: Number(latestChampion.season) } : null,
      allTimeProgramLeader: topProgram ? { team: topProgram.team, wins: topProgram.wins, losses: topProgram.losses, ties: topProgram.ties } : null,
      mostDecoratedRecipient: topAwardRecipient ? { name: topAwardRecipient.name, honors: topAwardRecipient.count } : null,
      topProgramHall: topProgramHall ? { team: topProgramHall.team, rank: topProgramHall.rank, points: topProgramHall.points } : null,
      topCoachHall: topCoach ? { name: topCoach.coach || topCoach.name || topCoach.username || 'Recorded coach', rank: topCoach.rank, points: topCoach.points } : null
    },
    navigation: ['Record Book', 'Program Hall of Fame', 'Coaching Hall of Fame', 'Award Leaders', 'Player Careers', 'Recruiting Class Archive', 'Dynasty Timeline'],
    note: 'The Almanac is an index into BLACKLINE history features, not a new source of truth. Coverage and highlights are derived from saved game results and explicitly recorded awards, titles, draft entries, recruiting history, and hall-of-fame data. Missing history is not inferred.'
  };
}
module.exports = { buildDynastyAlmanac };
