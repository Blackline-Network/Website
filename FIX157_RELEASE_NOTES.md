# BLACKLINE Bot Fix 157 — Notification Delivery Diagnostics

Version: 1.0.157

## Changes
- Adds manager-only `/teamnotifications status` to inspect the configured channel, channel reachability, event toggles, and available channel permission information.
- Adds manager-only `/teamnotifications test` to send a test embed and confirm live message delivery.
- Provides targeted remediation guidance for missing configuration, unavailable channels, and missing View Channel, Send Messages, or Embed Links permissions.
- Keeps diagnostic checks read-only; the test subcommand sends only the explicitly requested test message.
- Preserves existing team-claim notification configuration and database format.

## Install
Back up the project, extract the release, copy updated files into the existing project, and preserve `.env` and the live database. Run `npm test`, `npm run release-audit`, then `npm start`. Ensure slash commands are redeployed using the project's existing command deployment process if the new command does not appear.

## Validation scope
Automated tests and the release audit validate local behavior and syntax. They do not confirm live Discord permissions or delivery; run `/teamnotifications status` and `/teamnotifications test` in the server after deployment.
