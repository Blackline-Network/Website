# BLACKLINE Bot Fix 156 — Team Claim Notification Embed Upgrade

## Changes
- Replaces plain-text team claim announcements with readable Discord embeds.
- Uses distinct colors and event-specific titles/descriptions for claims, releases, and applied repairs.
- Shows dynasty, team, coach, manager, and repair summary fields when available.
- Adds a timestamp and BLACKLINE footer.
- Escapes @ characters in displayed user-provided values and explicitly disables Discord mentions.
- Keeps notification delivery best-effort: notification failures do not interrupt saved team actions.
- Preserves Fix 155 event-specific environment toggles and channel configuration.

## Installation
Back up the project and database, stop the bot, extract the ZIP, and copy the project files over the existing project. Preserve `.env` and the live database. Run `npm test`, `npm run release-audit`, and `npm start`.

## Configuration
No new configuration is required. Existing `TEAM_CLAIM_NOTIFICATION_CHANNEL_ID` and `TEAM_CLAIM_NOTIFY_CLAIMS`, `TEAM_CLAIM_NOTIFY_RELEASES`, and `TEAM_CLAIM_NOTIFY_REPAIRS` settings continue to work.
