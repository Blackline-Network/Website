'use strict';

const MAX_TEAM_CLAIM_AUDIT_EVENTS = 100;

function appendTeamClaimAudit(dynasty, event, details = {}, actor = {}) {
  if (!dynasty || typeof dynasty !== 'object') return null;
  if (!Array.isArray(dynasty.teamClaimAudit)) dynasty.teamClaimAudit = [];
  const record = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    event: String(event || 'unknown').slice(0, 40),
    team: details.team == null ? null : String(details.team).slice(0, 100),
    userId: details.userId == null ? null : String(details.userId).slice(0, 40),
    username: details.username == null ? null : String(details.username).slice(0, 100),
    actorId: actor.id == null ? null : String(actor.id).slice(0, 40),
    actorName: actor.username == null ? null : String(actor.username).slice(0, 100),
    summary: details.summary == null ? null : String(details.summary).slice(0, 300)
  };
  dynasty.teamClaimAudit.push(record);
  if (dynasty.teamClaimAudit.length > MAX_TEAM_CLAIM_AUDIT_EVENTS) {
    dynasty.teamClaimAudit.splice(0, dynasty.teamClaimAudit.length - MAX_TEAM_CLAIM_AUDIT_EVENTS);
  }
  return record;
}

function getTeamClaimAudit(dynasty, limit = 10) {
  const requested = Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 10;
  const safeLimit = Math.min(25, Math.max(1, requested));
  const events = Array.isArray(dynasty?.teamClaimAudit) ? dynasty.teamClaimAudit : [];
  return events.slice(-safeLimit).reverse().map(event => ({ ...event }));
}

module.exports = { MAX_TEAM_CLAIM_AUDIT_EVENTS, appendTeamClaimAudit, getTeamClaimAudit };
