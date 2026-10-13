'use strict';

const { coachLegacy } = require('./coachLegacy');

/**
 * Builds a read-only all-time coaching Hall of Fame from the league's existing
 * coach registrations and the caller's established career-stat calculation.
 * No missing tenure or achievement is inferred here.
 */
function buildCoachHallOfFame(dynasty, { getCareerStats = () => ({}), limit = 20 } = {}) {
  const seen = new Set();
  const coaches = (Array.isArray(dynasty?.coaches) ? dynasty.coaches : [])
    .filter(coach => coach && coach.userId != null && !seen.has(String(coach.userId)) && seen.add(String(coach.userId)))
    .map(coach => {
      const stats = getCareerStats(coach.userId) || {};
      const legacy = coachLegacy(stats);
      const milestones = Array.isArray(legacy.milestones) ? legacy.milestones : [];
      return {
        userId: String(coach.userId),
        name: String(coach.username || `Coach ${String(coach.userId).slice(-4)}`).slice(0, 80),
        stats: {
          wins: legacy.wins, losses: legacy.losses, ties: legacy.ties, games: legacy.games,
          winPercentage: legacy.winPct, nationalTitles: Math.max(0, Number(stats.titles) || 0),
          conferenceTitles: Math.max(0, Number(stats.conferenceTitles) || 0),
          heismanWinners: Math.max(0, Number(stats.heismanWinners) || 0),
          draftedPlayers: Math.max(0, Number(stats.draftedPlayers) || 0),
          otherAwards: Math.max(0, Number(stats.otherAwards) || 0),
          seasonsCoached: legacy.seasons, milestones
        },
        legacy: { score: legacy.score, tier: legacy.tier },
        hallOfFameTier: legacy.tier === 'Hall of Fame',
        milestones: milestones.slice(0, 8)
      };
    })
    .sort((a, b) => b.legacy.score - a.legacy.score || b.stats.winPercentage - a.stats.winPercentage ||
      b.stats.nationalTitles - a.stats.nationalTitles || a.name.localeCompare(b.name));
  const ranked = coaches.map((coach, index) => ({ rank: index + 1, ...coach }));
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  return {
    coaches: ranked.slice(0, safeLimit),
    coachesReviewed: coaches.length,
    inductedCount: coaches.filter(coach => coach.hallOfFameTier).length,
    scoring: 'Career wins + 0.5 per tie; national title 25; conference title 8; Heisman winner 5; drafted player 2; other award 1; recorded season coached 2 (maximum 40 seasons).',
    note: 'This descriptive ranking reuses BLACKLINE Coach Legacy scoring and only includes registered coaches with recorded career data. The Hall of Fame tier follows existing Coach Legacy thresholds; missing history is not inferred.'
  };
}

module.exports = { buildCoachHallOfFame };
