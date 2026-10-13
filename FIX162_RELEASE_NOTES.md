# BLACKLINE Bot Fix 162 — Notification History Export

Version: 1.0.162

## Changes
- Adds manager-only `/teamnotifications export` to download recent notification history as a CSV attachment.
- Supports outcome and event filters and exports up to 50 matching records.
- Includes UTC timestamp, event, outcome, reason, and error code columns.
- Escapes CSV fields and prefixes potentially dangerous spreadsheet formula values to reduce CSV formula-injection risk.
- Uses the existing local persistent history; does not alter claims, counters, or audit records.

## Install
Back up the project, extract the release, copy updated files while preserving `.env` and the live database, then run `npm test`, `npm run release-audit`, and `npm start`. Redeploy slash commands if the `export` subcommand does not appear.

## Notes
Exports contain only the up-to-50 recent events currently retained on this host and cannot reconstruct older history.
