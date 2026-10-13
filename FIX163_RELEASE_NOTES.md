# BLACKLINE Bot Fix 163 — Notification Retention Settings

Version: 1.0.163

## Changes
- Adds manager-only `/teamnotifications retention` to view or change the number of recent notification events retained.
- Supports configurable retention from 10 to 500 events; default remains 50.
- Persists the retention setting in `data/team-notification-retention.json` and keeps event history in `data/team-notification-health.json`.
- Increasing retention allows future events to accumulate up to the new limit; it cannot recover events already discarded by earlier releases.
- Decreasing retention trims older events immediately while leaving cumulative delivery counters intact.
- Keeps the setting and telemetry writes separate from team claim state.

## Install
Back up the project, extract the release, copy updated files while preserving `.env` and the live database, then run `npm test`, `npm run release-audit`, and `npm start`. Redeploy slash commands if `retention` does not appear.

## Usage
- `/teamnotifications retention` — show current retention.
- `/teamnotifications retention limit:200` — retain up to 200 recent events.

Only authorized league managers and administrators can use this command.
