# Fix 166 — Automatic Notification Failure Alerts

- Adds optional out-of-band alerts when recent notification failures reach a configurable threshold.
- Uses `TEAM_CLAIM_ALERT_CHANNEL_ID` as a separate Discord text channel; alerting is disabled when unset.
- Uses `TEAM_CLAIM_ALERT_FAILURE_THRESHOLD` (default 3, clamped to 1–10) against the latest 10 retained events.
- Rate-limits automatic alerts to one per 15 minutes to reduce staff-channel noise during outages.
- Alert delivery is best-effort and does not affect saved team claims/releases or normal notification outcomes.
- Alert messages disable all mentions.

## Configuration

Add these optional variables to `.env`:

```bash
TEAM_CLAIM_ALERT_CHANNEL_ID=YOUR_STAFF_ALERT_CHANNEL_ID
TEAM_CLAIM_ALERT_FAILURE_THRESHOLD=3
```

Keep the normal `TEAM_CLAIM_NOTIFICATION_CHANNEL_ID` setting separate. The bot needs View Channel, Send Messages, and Embed Links permissions in the alert channel.
