# BLACKLINE Bot Fix 161 — Notification History Viewer

Version: 1.0.161

## Changes
- Adds `/teamnotifications history` for manager-only browsing of saved notification outcomes.
- Supports optional filters for outcome (`failed`, `sent`, `skipped`) and event (`team_claimed`, `team_released`, `repair_applied`).
- Supports a bounded result limit of 1–25 entries; defaults to 10.
- Displays event time, outcome, reason, and error code when available.
- Reuses the existing locally persisted notification history and does not modify team claims or audit records.

## Install
Back up the project, extract the release, copy updated files while preserving `.env` and the live database, then run `npm test`, `npm run release-audit`, and `npm start`. Redeploy slash commands if the new `history` subcommand does not appear.

## Notes
History contains only events recorded since notification telemetry was introduced and retains up to 50 recent entries on this host.
