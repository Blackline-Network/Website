# BLACKLINE Bot Fix 167 — Notification Alert Recovery

- Adds a separate staff-channel recovery notice when a normal team-claim notification succeeds after a failure incident was detected.
- Persists the incident-active flag and start time alongside notification health history so the incident state survives bot restarts.
- Clears the incident on the first successful normal notification, preventing repeated recovery notices for the same incident.
- Recovery messages are sent only to `TEAM_CLAIM_ALERT_CHANNEL_ID`; they do not use `@everyone` and are not counted as normal notification events.
- Existing failure-alert threshold and 15-minute cooldown remain in place.

## Configuration

Use the existing Fix 166 settings in `.env`:

```dotenv
TEAM_CLAIM_ALERT_CHANNEL_ID=YOUR_STAFF_ALERT_CHANNEL_ID
TEAM_CLAIM_ALERT_FAILURE_THRESHOLD=3
```

## Validation

Run `npm test` and `npm run release-audit` before deploying. Live Discord channel permissions and delivery should be verified in your server.
