# BLACKLINE Bot Fix 152 — Automated Team Claim Repair

## What's new
- Adds manager-only `/teams repair` with a read-only preview by default.
- Explicit `apply: True` is required before any team-claim changes are saved.
- Removes only claims that are invalid for the dynasty's team pool, duplicate an already-kept team, lack a user ID, or give one user multiple teams.
- Keeps the first valid claim in saved order for deterministic conflict resolution.
- Persists the repaired claim list, then independently attempts to refresh the Team Selection panel and League Hub.
- The preview does not save changes or modify the stored claim list.

## Use
1. Run `/teams repair name:<dynasty>` to preview the proposed changes.
2. Review the counts and conflict policy in the private response.
3. If the proposed cleanup is correct, run `/teams repair name:<dynasty> apply:True`.
4. Run `/teams diagnostics name:<dynasty>` to verify the result.

This command is restricted to configured dynasty managers / BL Staff and Discord administrators. Make a backup before applying any data repair. The repair does not automatically remove coach records or modify panel references.

## Validation
- `npm test`: 315 tests passed, 0 failed.
- `node --check commands/teams.js` and `node --check utils/teamSelectionRepair.js`: passed.
- Live Discord behavior still requires verification in the target server.
