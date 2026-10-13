# BLACKLINE Bot Fix 151 — Team Selection Diagnostics Panel

## What's new
- Added `/teams diagnostics name:<dynasty>` for managers to inspect team-selection state without changing it.
- Reports team-pool size, claimed/available counts, and total claim records.
- Flags claims outside the current team pool, duplicate claims for the same team, users holding multiple team claims, claimant IDs without a matching coach record, and missing saved panel references.
- Checks the saved Team Selection channel/message references and provides actionable Discord permission/reference diagnostics.
- Includes recovery guidance: try `/panels refresh` first; use `/teams setup` only if the existing panel cannot be recovered.
- Diagnostic output suppresses mention parsing and does not edit claims or create Discord messages.

## Validation
- Added automated tests for healthy state, stale/duplicate claims, multiple team claims per user, missing panel references, coach mismatches, and non-mutating behavior.
- Run `npm test` before deploying.

## Upgrade
1. Stop the bot.
2. Back up the current project and database.
3. Extract this ZIP and copy the project files over the existing project, preserving `.env` and your live database.
4. Run `npm test`, then `npm start`.
5. In Discord, run `/teams diagnostics` and select the dynasty name. The command is manager-only.
