# BLACKLINE Bot Fix 154 — Team Claim Change Notifications

## Changes
- Adds optional Discord text-channel notifications for successful team claims, manager releases, and applied claim repairs.
- Configure `TEAM_CLAIM_NOTIFICATION_CHANNEL_ID` in `.env` with the target channel ID. Leave blank to disable.
- Uses `allowedMentions: { parse: [] }` to prevent accidental pings.
- Notification delivery is best-effort: fetch/send errors are logged and never roll back or block a saved team action.
- Existing audit history and database formats remain compatible.

## Install
Back up the project and database, stop the bot, extract the ZIP, and copy updated files over the project while preserving `.env` and the live database. Optionally add `TEAM_CLAIM_NOTIFICATION_CHANNEL_ID` to `.env`. The bot needs permission to view and send messages in that channel. Run `npm test`, then `npm start`.

## Verification
Run `npm test` and `npm run release-audit`. Test notifications in a private Discord channel before using a public announcement channel.
