# BLACKLINE Bot Fix 153 — Team Claim Audit History

## What's new
- Adds manager-only `/teams history name:<dynasty> limit:<1–25>` to review recent claim, release, and repair events.
- Records successful team claims, manager releases, and applied claim repairs with UTC timestamps and actor/coach identifiers when available.
- Retains at most 100 events per dynasty to bound database growth.
- History is ephemeral in Discord and does not modify team ownership when viewed.
- Existing databases without audit history remain compatible; history starts collecting events after this version is installed.

## Install
1. Stop BLACKLINE Bot.
2. Back up the project and live database.
3. Extract this ZIP and copy updated project files into the existing project, preserving `.env` and live database files.
4. Run `npm test`, then `npm start`.

## Validation
Run `npm test` from the project folder. The audit history is local database history, not a retroactive Discord log; previous claims are not reconstructed.
