# BLACKLINE Bot Fix 149 — Team Claim Consistency

Based on Fix 148.

## Changes
- Team names are compared using normalized, case-insensitive keys when checking claims and releasing teams.
- Claims persist the canonical team name from the configured team pool.
- Rejects missing user IDs rather than creating malformed claims.
- Stores claim user IDs as strings and uses a safe username fallback.
- Keeps the existing availability and already-has-team responses.

## Install
Back up the project first. Extract the ZIP separately, then copy the updated files over your project while preserving `.env` and live data files. Run `npm test`, then `npm start`.
