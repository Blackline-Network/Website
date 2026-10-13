# BLACKLINE Bot Fix 155 — Team Claim Notification Controls

## Changes
- Adds independent environment switches for team claim, release, and repair announcements.
- `TEAM_CLAIM_NOTIFY_CLAIMS`, `TEAM_CLAIM_NOTIFY_RELEASES`, and `TEAM_CLAIM_NOTIFY_REPAIRS` default to enabled for backward compatibility.
- Set a switch to `false`, `0`, `no`, `off`, or `disabled` to suppress that event type. Other values leave it enabled.
- Disabled events are skipped before fetching the Discord channel.
- Existing channel configuration, mention protection, and best-effort delivery behavior remain unchanged.

## Install
Back up the project and database, stop the bot, extract this ZIP, and copy the updated files over the project while preserving `.env` and the live database. Configure the optional switches in `.env`, then run `npm test`, `npm run release-audit`, and `npm start`.

## Example
```bash
TEAM_CLAIM_NOTIFICATION_CHANNEL_ID=YOUR_CHANNEL_ID
TEAM_CLAIM_NOTIFY_CLAIMS=true
TEAM_CLAIM_NOTIFY_RELEASES=false
TEAM_CLAIM_NOTIFY_REPAIRS=true
```

The example enables claim and repair announcements while suppressing releases. Live Discord delivery must be verified in the target server.
