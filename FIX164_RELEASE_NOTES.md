# BLACKLINE Bot Fix 164 — Notification Health Summary Reports

Version: `1.0.164`

## Changes
- Added manager-only `/teamnotifications summary` report.
- Summarizes cumulative attempted/sent/failed/skipped counts and retained-history capacity.
- Shows per-event sent/failed/skipped counts, calculated delivery success rate when sent/failed data exists, and the most recent retained failure.
- Reuses the persistent telemetry already maintained by Fix 160+, without changing team-claim records or notification behavior.

## Installation
1. Stop the bot.
2. Back up the project and live database.
3. Copy the updated project files while preserving `.env` and the live database.
4. Run `npm test` and `npm run release-audit`, then start the bot.
5. Redeploy slash commands if `/teamnotifications summary` is not listed.

## Notes
The report uses locally persisted notification telemetry. Per-event counts and the most recent failure depend on events recorded by this bot instance/history file. Verify the command in the target Discord server after installation.
