# BLACKLINE Bot Fix 165 — Notification Health Alerts

Version: 1.0.165

## Changes
- Added `/teamnotifications alerts` for manager-only checks of notification channel configuration and repeated recent delivery failures.
- Evaluates the latest 10 retained events and reports the most recent failure details.
- Supports `TEAM_CLAIM_ALERT_FAILURE_THRESHOLD` (integer 1–10; defaults to 3).
- The command is read-only and does not send proactive messages or alter team claims.

## Install
Stop the bot, back up the project, extract this release over the existing project while preserving `.env` and live data, then run `npm test`, `npm run release-audit`, and `npm start`. Redeploy slash commands using the existing project process if the new subcommand does not appear.

## Limitations
Alerts are evaluated when a manager runs the command; this release does not send automatic push alerts. It uses the existing local notification history, so its assessment depends on retained events.
