'use strict';

/** Prepare a closed-season archive without mutating the dynasty. Existing archives are immutable here. */
function prepareSeasonArchive(dynasty, { closedAt = new Date().toISOString(), closedBy = null, standings = [], games = [] } = {}) {
  const season = Number(dynasty?.season);
  if (!Number.isInteger(season) || season < 1) return { error: 'The current season number is invalid; season closing was stopped.' };
  const archives = Array.isArray(dynasty?.seasonArchives) ? dynasty.seasonArchives : [];
  const existing = archives.find(row => Number(row?.season) === season);
  if (existing) return { error: `An archive for Season ${season} already exists. BLACKLINE will not overwrite an existing historical archive automatically.` };
  const championRows = (Array.isArray(dynasty?.championshipHistory) ? dynasty.championshipHistory : [])
    .filter(row => Number(row?.season) === season && String(row?.champion || '').trim());
  if (championRows.length !== 1) return { error: `Season ${season} must have exactly one recorded champion before an archive can be created.` };
  const seasonGames = (Array.isArray(games) ? games : []).filter(game => Number(game?.season) === season);
  if (!seasonGames.length) return { error: `Season ${season} has no games to archive.` };
  const champion = championRows[0];
  const bracket = dynasty?.playoffBracket && Number(dynasty.playoffBracket.season) === season
    ? JSON.parse(JSON.stringify(dynasty.playoffBracket)) : null;
  return { archive: {
    season, year: dynasty.seasonYear ?? null, closedAt, closedBy,
    champion: champion.champion, runnerUp: champion.runnerUp || null,
    standings: JSON.parse(JSON.stringify(Array.isArray(standings) ? standings : [])),
    gameCount: seasonGames.length,
    completedGames: seasonGames.filter(game => game.status === 'final').length,
    playoffBracket: bracket
  } };
}

module.exports = { prepareSeasonArchive };
