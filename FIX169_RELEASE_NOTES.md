# Fix 169 — Creator Connections

Adds a member-facing Twitch account connection page at `/creator-connections.html`.

## Features
- Discord-authenticated Twitch OAuth initiation and callback with single-use, expiring state bound to the current BLACKLINE session.
- Verifies the Twitch identity using Helix `/users`; stores only Twitch identity metadata, never Twitch OAuth tokens.
- One Twitch identity cannot be linked to two different Discord members.
- Authenticated member endpoint to inspect their own link and CSRF-protected DELETE endpoint to unlink.
- Persistent storage defaults to `data/website-twitch-links.json`, with atomic JSON writes.
- Friendly setup/configuration errors and a standalone Creator Connections UI.

## Configure
1. Register an application at https://dev.twitch.tv/console/apps.
2. Add the exact OAuth redirect URI configured below to the Twitch app.
3. In the private project-root `.env`, set `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `TWITCH_OAUTH_REDIRECT_URI=http://localhost:3030/auth/twitch/callback` (change the host for your deployed HTTPS site).
4. Make sure Discord website OAuth is already configured and sign in first.
5. Visit `/creator-connections.html`.

Never commit `.env` or share Twitch client secrets. For production, use HTTPS. Account linking does not by itself enable live polling or Discord stream announcements; those remain separate integrations.
