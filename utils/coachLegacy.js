'use strict';

function coachLegacy(stats = {}) {
  const wins = Math.max(0, Number(stats.wins) || 0);
  const losses = Math.max(0, Number(stats.losses) || 0);
  const ties = Math.max(0, Number(stats.ties) || 0);
  const games = wins + losses + ties;
  const winPct = games ? (wins + ties * 0.5) / games * 100 : 0;
  const titles = Math.max(0, Number(stats.titles) || 0);
  const conferenceTitles = Math.max(0, Number(stats.conferenceTitles) || 0);
  const heismanWinners = Math.max(0, Number(stats.heismanWinners) || 0);
  const draftedPlayers = Math.max(0, Number(stats.draftedPlayers) || 0);
  const otherAwards = Math.max(0, Number(stats.otherAwards) || 0);
  const entries = Array.isArray(stats.entries) ? stats.entries : [];
  const seasons = entries.reduce((sum, e) => {
    const start = Number(e.startSeason), end = Number(e.endSeason ?? e.startSeason);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return sum;
    return sum + Math.min(100, end - start + 1);
  }, 0);
  // Score is descriptive, deterministic, and based only on recorded data.
  const score = Math.round(wins + ties * 0.5 + titles * 25 + conferenceTitles * 8 + heismanWinners * 5 + draftedPlayers * 2 + otherAwards + Math.min(seasons, 40) * 2);
  let tier = 'Rising Coach';
  if (score >= 250 || titles >= 3 || wins >= 100) tier = 'Hall of Fame';
  else if (score >= 120 || titles >= 2 || wins >= 60) tier = 'Legend';
  else if (score >= 60 || titles >= 1 || wins >= 30) tier = 'Elite';
  else if (score >= 20 || wins >= 10) tier = 'Established';
  const milestones = [];
  for (const threshold of [10, 25, 50, 100, 150, 200]) if (wins >= threshold) milestones.push(`${threshold} career wins`);
  if (games >= 100) milestones.push('100 career games');
  if (games >= 20 && winPct >= 60) milestones.push('60%+ career win rate');
  if (titles) milestones.push(`${titles} national ${titles === 1 ? 'title' : 'titles'}`);
  if (conferenceTitles) milestones.push(`${conferenceTitles} conference ${conferenceTitles === 1 ? 'title' : 'titles'}`);
  if (heismanWinners) milestones.push(`${heismanWinners} Heisman ${heismanWinners === 1 ? 'winner coached' : 'winners coached'}`);
  if (draftedPlayers >= 10) milestones.push('10+ drafted players');
  return { score, tier, wins, losses, ties, games, winPct, seasons, milestones };
}

function rankCoachLegacy(coaches) {
  return (coaches || []).map(coach => ({ ...coach, legacy: coachLegacy(coach.stats) }))
    .sort((a, b) => b.legacy.score - a.legacy.score || b.legacy.winPct - a.legacy.winPct || a.name.localeCompare(b.name));
}

function formatCoachLegacyLines(ranked, limit = 15) {
  return (Array.isArray(ranked) ? ranked : []).slice(0, Math.max(0, Number(limit) || 0)).map((coach, index) => {
    const stats = coach.stats || {};
    const legacy = coach.legacy || coachLegacy(stats);
    const record = `${legacy.wins}-${legacy.losses}${legacy.ties ? `-${legacy.ties}` : ''}`;
    const winPct = legacy.games ? `${legacy.winPct.toFixed(1)}%` : 'N/A';
    return `**${index + 1}. ${String(coach.name || 'Unknown Coach').slice(0, 70)}** — ${legacy.tier} · ${legacy.score} legacy pts\n${record} · ${winPct} win rate · ${Number(stats.titles) || 0} national title(s) · ${Number(stats.conferenceTitles) || 0} conference title(s)`;
  });
}
module.exports = { coachLegacy, rankCoachLegacy, formatCoachLegacyLines };
