'use strict';
const { getTeamsForDynasty, normalizeTeamKey } = require('./teams');

// Conservative deterministic repair: keep the first valid claim in saved order.
// A claim is removed only when its team is outside the pool, its team is already
// claimed, or its user already has an earlier valid claim. This module never saves
// files or touches Discord; callers must explicitly apply and persist the plan.
function planTeamSelectionRepair(dynasty) {
  const teams = getTeamsForDynasty(dynasty);
  const validTeamKeys = new Set(teams.map(normalizeTeamKey));
  const selections = Array.isArray(dynasty?.teamSelections) ? [...dynasty.teamSelections] : [];
  const kept = [];
  const removed = [];
  const usedTeams = new Set();
  const usedUsers = new Set();

  for (let index = 0; index < selections.length; index++) {
    const selection = selections[index];
    const teamKey = normalizeTeamKey(selection?.team);
    const userId = String(selection?.userId || '').trim();
    let reason = null;
    if (!teamKey || !validTeamKeys.has(teamKey)) reason = 'invalid_team';
    else if (usedTeams.has(teamKey)) reason = 'duplicate_team';
    else if (!userId) reason = 'missing_user_id';
    else if (usedUsers.has(userId)) reason = 'multiple_teams_for_user';

    if (reason) removed.push({ index, selection, reason });
    else {
      kept.push(selection);
      usedTeams.add(teamKey);
      usedUsers.add(userId);
    }
  }
  return {
    total: selections.length,
    kept,
    removed,
    counts: removed.reduce((acc, row) => { acc[row.reason] = (acc[row.reason] || 0) + 1; return acc; }, {})
  };
}

function applyTeamSelectionRepair(dynasty, plan) {
  if (!dynasty || !plan || !Array.isArray(plan.kept) || !Array.isArray(plan.removed)) {
    throw new TypeError('A valid dynasty and repair plan are required.');
  }
  // Assign a new array so callers can safely compare the prior snapshot if needed.
  dynasty.teamSelections = [...plan.kept];
  return { removed: plan.removed.length, remaining: dynasty.teamSelections.length };
}

module.exports = { planTeamSelectionRepair, applyTeamSelectionRepair };
