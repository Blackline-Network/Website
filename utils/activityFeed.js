'use strict';

const ACTION_LABELS = Object.freeze({
  'notification-channel-configured': 'Announcement channel updated',
  'notification-event-setting-changed': 'Announcement preferences updated',
  'score-corrected': 'Final score corrected',
  'score-recorded': 'Final score recorded',
  'championship-recorded': 'Championship recorded',
  'offseason-advanced': 'Offseason transition completed',
  'roster-player-upserted': 'Roster updated',
  'recruit-prospect-upserted': 'Recruiting record updated',
  'player-development-applied': 'Player development applied',
  'history-record-upserted': 'Historical honor recorded'
});

function safeDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function buildActivityFeed(dynasty, { limit = 10 } = {}) {
  const entries = [];
  const push = entry => {
    if (!entry || !entry.title) return;
    entries.push({ title: String(entry.title).slice(0, 180), at: safeDate(entry.at), season: Number.isFinite(Number(entry.season)) ? Number(entry.season) : Number(dynasty.season) || null, source: entry.source || 'league' });
  };

  for (const game of dynasty.scheduleGames || []) {
    if (game.status !== 'final' || !game.homeTeam || !game.awayTeam || !Number.isFinite(Number(game.homeScore)) || !Number.isFinite(Number(game.awayScore))) continue;
    push({ title: `Final: ${game.awayTeam} ${game.awayScore} at ${game.homeTeam} ${game.homeScore}`, at: game.finalizedAt || game.completedAt || game.updatedAt || game.kickoff, season: game.season, source: 'score' });
  }
  for (const record of dynasty.championshipHistory || []) {
    if (!record.champion) continue;
    push({ title: `Season ${record.season}: ${record.champion} won the championship${record.runnerUp ? ` over ${record.runnerUp}` : ''}`, at: record.recordedAt || record.createdAt, season: record.season, source: 'championship' });
  }
  for (const record of dynasty.conferenceChampionsHistory || []) {
    const winner = record.champion || record.team || record.winner;
    if (winner) push({ title: `Season ${record.season}: ${winner} won ${record.conference || 'a conference title'}`, at: record.recordedAt || record.createdAt, season: record.season, source: 'championship' });
  }
  for (const record of dynasty.heismanHistory || []) {
    const winner = record.winner || record.player || record.recipient;
    if (winner) push({ title: `Season ${record.season}: ${winner} received the Heisman`, at: record.recordedAt || record.createdAt, season: record.season, source: 'award' });
  }
  for (const record of dynasty.awardHistory || []) {
    const recipient = record.winner || record.player || record.recipient || record.name;
    if (recipient) push({ title: `Season ${record.season}: ${recipient} — ${record.award || record.title || record.category || 'league honor'}`, at: record.recordedAt || record.createdAt, season: record.season, source: 'award' });
  }
  // Recruiting milestones come only from explicit status-history transitions.
  // Legacy prospect records without history are intentionally not backfilled.
  for (const prospect of dynasty.recruitingProspects || []) {
    if (!prospect || !Array.isArray(prospect.statusHistory)) continue;
    for (const event of prospect.statusHistory) {
      const status = String(event.toStatus || '').trim().toLocaleLowerCase();
      if (status !== 'committed' && status !== 'signed') continue;
      const name = String(prospect.name || 'Unknown prospect').trim();
      const team = String(event.team || prospect.team || 'an unassigned team').trim();
      const position = String(prospect.position || 'N/A').trim();
      const stars = Math.max(0, Math.min(5, Number(prospect.stars) || 0));
      const milestone = status === 'committed' ? 'committed to' : 'signed with';
      push({
        title: `Recruiting: ${name} (${position}, ${stars}★) ${milestone} ${team}`,
        at: event.at,
        season: event.season || prospect.season,
        source: 'recruiting'
      });
    }
  }

  for (const record of dynasty.notificationLog || []) {
    const type = String(record.type || 'league').replace(/-/g, ' ');
    push({ title: `League announcement published: ${type}`, at: record.sentAt, season: record.season, source: 'announcement' });
  }
  for (const record of dynasty.staffAuditLog || []) {
    const action = ACTION_LABELS[record.action];
    if (action) push({ title: action, at: record.at, season: record.details?.season, source: 'operations' });
  }

  // Dedupe repeated representations of the same result, but keep separate events with distinct dates.
  const seen = new Set();
  const unique = entries.filter(entry => {
    const key = `${entry.title.toLocaleLowerCase()}|${entry.at || ''}|${entry.season || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => {
    if (a.at && b.at) return b.at.localeCompare(a.at);
    if (a.at) return -1;
    if (b.at) return 1;
    return Number(b.season || 0) - Number(a.season || 0);
  });
  return unique.slice(0, Math.max(1, Math.min(20, Number(limit) || 10)));
}

function summarizeActivityFeed(dynasty, options) {
  const items = buildActivityFeed(dynasty, options);
  return {
    items,
    counts: items.reduce((counts, item) => { counts[item.source] = (counts[item.source] || 0) + 1; return counts; }, {}),
    total: items.length
  };
}

module.exports = { buildActivityFeed, summarizeActivityFeed };
