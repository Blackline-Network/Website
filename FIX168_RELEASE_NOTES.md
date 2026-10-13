# BLACKLINE Fix 168 — Notification Incident Timeline

Version: 1.0.168

- Adds `/teamnotifications timeline` for a chronological view of retained notification outcomes.
- Shows whether a notification incident is currently active and its recorded start time.
- Displays successful, failed, and skipped events with timestamps and available failure details.
- Adds incident-state fields to the health snapshot returned by the notification utility.
- Keeps existing notification sending, failure alerts, recovery notices, and retention behavior.

The timeline reflects locally retained telemetry; it does not independently probe Discord or prove live channel availability.
