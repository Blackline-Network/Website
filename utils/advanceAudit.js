const { appendAuditEntry } = require('./operations');

function phaseSnapshot(dynasty) {
  return {
    season: Number(dynasty?.season || 1),
    seasonYear: Number(dynasty?.seasonYear || 0),
    phase: String(dynasty?.currentPhaseLabel || dynasty?.currentPhase || 'Unknown')
  };
}

function recordAdvance(dynasty, { source, actorId = 'system', actorTag = 'BLACKLINE Scheduler', from, to, at } = {}) {
  const before = from || phaseSnapshot(dynasty);
  const after = to || phaseSnapshot(dynasty);
  return appendAuditEntry(dynasty, {
    action: 'week-advance', actorId, actorTag,
    details: {
      source: source || 'unknown',
      fromSeason: before.season,
      fromYear: before.seasonYear,
      fromPhase: before.phase,
      toSeason: after.season,
      toYear: after.seasonYear,
      toPhase: after.phase
    }
  }, at || new Date());
}

function recordAdvanceBlocked(dynasty, { source, actorId = 'system', actorTag = 'BLACKLINE Scheduler', blockers = [], at } = {}) {
  return appendAuditEntry(dynasty, {
    action: 'week-advance-blocked', actorId, actorTag,
    details: { source: source || 'unknown', blockerCount: blockers.length, blockers: blockers.join(' | ') || 'unspecified' }
  }, at || new Date());
}

function recordPanelSync(dynasty, result, { source, at } = {}) {
  const refreshed = Array.isArray(result?.refreshed) ? result.refreshed : [];
  const failed = Array.isArray(result?.failed) ? result.failed : [];
  return appendAuditEntry(dynasty, {
    action: 'week-advance-panel-sync',
    actorId: source === 'manual' ? 'staff-action' : 'system',
    actorTag: source === 'manual' ? 'Staff-triggered advance' : 'BLACKLINE Scheduler',
    details: {
      source: source || 'unknown',
      refreshedCount: refreshed.length,
      failedCount: failed.length,
      refreshed: refreshed.join(', ') || 'none',
      failed: failed.join(', ') || 'none',
      result: failed.length ? 'partial' : 'success'
    }
  }, at || new Date());
}

function getAdvanceAuditEntries(dynasty, limit = 12) {
  const entries = Array.isArray(dynasty?.staffAuditLog) ? dynasty.staffAuditLog : [];
  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 12));
  return entries.filter(entry => ['week-advance', 'week-advance-panel-sync', 'week-advance-blocked'].includes(entry.action)).slice(-boundedLimit).reverse();
}

module.exports = { phaseSnapshot, recordAdvance, recordAdvanceBlocked, recordPanelSync, getAdvanceAuditEntries };
