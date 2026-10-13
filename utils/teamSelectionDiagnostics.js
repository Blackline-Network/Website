'use strict';
const { getTeamsForDynasty, getTeamSelections, normalizeTeamKey } = require('./teams');

function diagnoseTeamSelection(dynasty) {
  const teams = getTeamsForDynasty(dynasty);
  const selections = [...getTeamSelections(dynasty)];
  const validTeamKeys = new Set(teams.map(normalizeTeamKey));
  const claimsByTeam = new Map();
  const claimsByUser = new Map();
  const invalidClaims = [];
  for (const selection of selections) {
    const teamKey = normalizeTeamKey(selection?.team);
    const userId = String(selection?.userId || '');
    if (!validTeamKeys.has(teamKey)) invalidClaims.push(selection);
    if (!claimsByTeam.has(teamKey)) claimsByTeam.set(teamKey, []);
    claimsByTeam.get(teamKey).push(selection);
    if (userId) {
      if (!claimsByUser.has(userId)) claimsByUser.set(userId, []);
      claimsByUser.get(userId).push(selection);
    }
  }
  const duplicateTeamClaims = [...claimsByTeam.values()].filter(rows => rows.length > 1).flat();
  const multipleTeamsPerUser = [...claimsByUser.values()].filter(rows => rows.length > 1).flat();
  const claimedKeys = new Set(selections.map(s => normalizeTeamKey(s?.team)));
  const availableTeams = teams.filter(team => !claimedKeys.has(normalizeTeamKey(team)));
  const coaches = Array.isArray(dynasty?.coaches) ? dynasty.coaches : [];
  const coachIds = new Set(coaches.map(c => String(c?.userId || c?.id || '')).filter(Boolean));
  const claimantsWithoutCoach = [...new Set(selections.filter(s => s?.userId && !coachIds.has(String(s.userId))).map(s => String(s.userId)))];
  const issues = [];
  if (invalidClaims.length) issues.push(`${invalidClaims.length} claim(s) reference teams outside this dynasty's team pool`);
  if (duplicateTeamClaims.length) issues.push(`${duplicateTeamClaims.length} claim record(s) are part of duplicate team claims`);
  if (multipleTeamsPerUser.length) issues.push(`${multipleTeamsPerUser.length} claim record(s) belong to users with multiple teams`);
  if (claimantsWithoutCoach.length) issues.push(`${claimantsWithoutCoach.length} claimant(s) have no matching coach record`);
  if (!dynasty?.teamChannelId) issues.push('Team Selection channel ID is missing');
  if (!dynasty?.teamMessageId) issues.push('Team Selection message ID is missing');
  return {
    totalTeams: teams.length, claimedTeams: new Set(selections.map(s => normalizeTeamKey(s?.team)).filter(k => validTeamKeys.has(k))).size,
    availableTeams: availableTeams.length, claimRecords: selections.length,
    invalidClaims, duplicateTeamClaims, multipleTeamsPerUser, claimantsWithoutCoach,
    missingChannelId: !dynasty?.teamChannelId, missingMessageId: !dynasty?.teamMessageId,
    issues, healthy: issues.length === 0
  };
}
module.exports = { diagnoseTeamSelection };
