# BLACKLINE Bot Fix 159 — Notification Health Dashboard

Version: `1.0.159`

## Changes
- Added manager-only `/teamnotifications health` to summarize notification delivery counters and recent failures.
- Tracks sent, failed, and skipped outcomes by event type in bounded in-memory history (50 most recent events).
- Includes failure reason and error code where available, without exposing message contents or credentials.
- Preserves existing `/teamnotifications status` configuration diagnostics and `/teamnotifications test` delivery test.
- Team claims/releases remain independent of notification failures.

## Important behavior
- Health history is process-local and resets when the bot restarts; it is diagnostic telemetry, not a durable audit log.
- No database migration is required.

## Validation
Run `npm test` and `npm run release-audit` before deploying. Verify `/teamnotifications health` in Discord after slash commands are deployed.

## Upgrade
Back up the project and database, preserve `.env` and live data, then copy the updated project files into the existing installation.
