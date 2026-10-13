# BLACKLINE Bot Fix 158 — Notification Retry and Failure Logging

Version: 1.0.158

## Changes
- Retries transient channel-fetch failures (rate limits, server errors, and common connection errors) with bounded attempts and backoff.
- Retries message sends only for explicit Discord HTTP 429 responses to reduce the chance of duplicate announcements after ambiguous network failures.
- Adds structured warning/error logs with operation, event, channel ID, attempt count, status/code, and retry decision.
- Keeps notifications best-effort: failures are reported and do not undo already-saved team actions.
- Does not persist tokens or full message payloads in logs.

## Install
Back up the project, extract this release, copy updated files into the existing project, and preserve `.env` and the live database. Run `npm test`, `npm run release-audit`, then `npm start`.

## Validation scope
Automated tests and release audit validate local behavior and syntax; they do not verify live Discord API behavior.
