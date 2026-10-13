# BLACKLINE Fix 88 — Competition Center & Panel Recovery

Improves recovery for existing public panels when saved Discord channel/message IDs are stale, a panel channel was moved, or a message reference is no longer valid. It extends existing refresh workflows and does not create duplicate panel systems.

## Included
- Shared panel-target recovery validates that a saved channel belongs to the expected Discord server.
- Recover existing Competition Center, League History, Coach Center, and Team Selection panels by matching their canonical embed titles.
- Prefer the configured category when locating a panel channel, while still checking matching channels if a panel was moved.
- Persist repaired channel/message references to the correct dynasty record.
- Never create a new panel during refresh when the existing panel cannot be located.
- Preserve button-driven member workflows and staff-only slash command restrictions.
- Add regression tests for stale references, cross-server channel rejection, and avoiding duplicate panel creation.

## Validation
- `npm test`: 221 tests passed.
- JavaScript syntax checks passed for all project JavaScript files.
- ZIP archive integrity verified.
- Live Discord behavior has not been verified against a production server.


## Fix 89 — Schedule & Advance Workflow Guard

- Manual and automatic phase advances run a shared preflight check.
- Advancement is blocked when the current season has schedule integrity errors or the active numbered week contains games without valid final scores.
- Blocked attempts are recorded in the advance audit, including the source and reasons.
- Automatic scheduler attempts are evaluated once per local calendar date to avoid repeated blocked logs; staff can correct results and manually retry. A manual advance also suppresses a second automatic advance on that same local date.
- No force-advance bypass is added in this release.


## Fix 90 — Data Integrity & Recovery

- Staff-only `/league backup-verify` validates a named backup's JSON structure without restoring it.
- Staff-only `/league backup-restore` requires explicit confirmation, validates the selected backup, preserves the pre-restore live file in `data/backups/pre-restore-snapshots/`, and atomically replaces the live database.
- Restore is database-wide: it affects every dynasty in `data/dynasties.json`, not only the selected league.
- Validation checks required structure and flags suspicious optional fields; it cannot prove that recorded scores or historical facts are correct.
- Keep an off-host backup. A backup stored on the same machine is not sufficient protection against disk or host loss.

## Fix 91 — Permissions & Interaction Audit

- Centralizes the manager-role policy in `utils/accessControl.js`, including configurable role names/IDs and Administrator permission handling.
- Closes missing staff authorization checks on `/poll create` and `/panels refresh`; both reject non-staff users ephemerally before reading or mutating league data or performing panel refreshes.
- Public poll voting remains button-driven for members and is not staff-gated.
- Adds regression tests for default/configured roles, role-name and role-ID matching, administrator access, and denial of ordinary/incomplete member contexts.

## Validation

- Automated tests and JavaScript syntax checks are run for this package before release.
- Live Discord command deployment and role behavior have not been tested against a production server.

## Fix 92 — Workflow Reliability & Error Recovery

- Added a shared interaction response helper that chooses an initial reply or edits an acknowledged interaction based on its current state.
- Handles expired/non-repliable interaction responses as structured failures and deliberately avoids retrying with a second acknowledgement, which could cause duplicate responses.
- Applied the helper to the staff panel refresh command's permission-denial, missing-dynasty, and completion responses.
- Added regression coverage for initial, deferred, already-replied, expired, and non-repliable interaction cases.

Validation: automated test suite and JavaScript syntax checks should be run before deployment. Live Discord behavior still requires verification in the target server.

## Fix 93 — Panel Recovery & State Consistency

- Panel refresh synchronization now merges only panel-reference fields changed by the current refresh into the latest database snapshot, rather than copying every reference from an older in-memory dynasty object.
- Panel reference recovery refuses ambiguous same-name dynasty records and avoids binding a recovered panel to a different Discord guild.
- Added regression tests for concurrent panel-reference updates, explicit stale-reference clearing, and non-mutating merge behavior.

## Fix 94 — Schedule & Competition Center Reliability

- Bulk panel refresh now diagnoses common failures per panel instead of returning a generic permissions checklist.
- Staff receive specific guidance for missing guild configuration, inaccessible guilds, missing or cross-guild channel references, non-text channels, missing bot permissions, and unavailable saved messages.
- Diagnostics are read-only and do not create duplicate panels or modify saved references.
- Added regression tests for panel label mapping and safe diagnostic fallbacks.

Validation: run `npm test` and JavaScript syntax checks before deployment. Live Discord behavior still requires verification in the target server.

## Fix 95 — Schedule & Readiness Recovery

- Schedule / readiness refresh no longer automatically posts a replacement when a saved message reference is stale. The original panel may be outside the recent-message scan window, so creating another post could produce duplicates.
- If the bot cannot read recent channel history, refresh fails safely rather than guessing whether an existing panel is present.
- When no message reference exists and channel history is successfully checked, the existing readiness panel can still be recovered or created as appropriate.
- Added regression coverage for stale references, unavailable history, recovered panels, and safe initial creation.

Validation: run `npm test` and JavaScript syntax checks before deployment. Live Discord behavior still requires verification in the target server.

## Fix 96 — Competition Center Recovery & State Safety

- Bulk panel refresh now merges only panel references changed during the refresh, instead of copying all values from its original in-memory dynasty snapshot back into the database.
- This prevents an unrelated panel refresh from overwriting newer Competition Center channel/message references saved concurrently.
- Existing panel recovery remains fail-safe: refresh updates an existing matching panel and does not create a duplicate when recovery cannot confirm the original message.
- Automated regression coverage includes concurrent Competition Center reference changes.


## Fix 97 — Panel Health & Repair Diagnostics

- Panel refresh diagnostics now preserve and interpret common Discord API error codes instead of collapsing every fetch failure into a generic missing-reference message.
- Distinguishes deleted channels/messages from Missing Access and Missing Permissions responses when Discord provides those codes.
- Unknown/network errors still receive cautious fallback guidance; diagnostics do not claim to repair a panel automatically.
- Adds regression coverage for deleted-message and permission-error diagnosis.

Validation: run `npm test` and `node --check` on project JavaScript files. Live Discord behavior still depends on the bot's actual guild membership, channel overrides, and API responses.

## Fix 98 — League Workflow Integrity

- Validates official league result inputs before any schedule mutation: week bounds, non-empty/distinct teams, integer scores, and score bounds.
- Applies the same validation when a manager approves a submitted score report, guarding against malformed or stale persisted reports.
- Refuses to apply score reports from a previous season to the current season; the report is marked for manual historical review instead.
- Adds an audit entry when a score report is approved or corrects an existing result, including the previous and new score.
- Adds regression tests for valid ties, invalid weeks/teams/scores, and previous-result interpretation.

Validation: `npm test` (259 tests passing) and JavaScript syntax checks. Live Discord workflows have not been tested in a production server.


## Fix 99 — Season Transition & Historical Record Protection
- Season closing refuses to overwrite an existing archive for the same season.
- Archive preparation validates season identity and champion uniqueness before mutation.
- Standings and playoff bracket snapshots are copied so later edits cannot mutate archived snapshots by reference.
- Historical archive conflicts stop the close operation and direct staff to review records rather than silently replacing history.

## Fix 100 — Stability & Release Audit
- Added a repeatable release audit for required project files, package metadata, and matching `package.json` / `package-lock.json` versions.
- Added a repository-wide JavaScript syntax check to the release audit so syntax failures are reported before deployment.
- Added regression tests for metadata mismatches and missing release paths.
- Run `npm test` and `npm run release-audit` before deploying a release.
- This audit does not replace staging tests, production Discord checks, or a verified backup.

## Fix 100 Release Validation
- Automated test suite and release audit should be run from the `Blackline Bot` directory.
- Live Discord deployment and API/permission behavior have not been verified as part of this package build.


## Fix 101 — Staging & Deployment Safety

Before connecting to Discord, BLACKLINE now runs a startup preflight. It stops early when `TOKEN` is missing or malformed, rejects an invalid optional `DEFAULT_TIMEZONE`, and checks that an existing `data/dynasties.json` file is parseable and contains a `dynasties` array. A missing database is reported as a warning so first-time setup remains possible; install or restore the database before using league workflows.

1. Copy `.env.example` to `.env` and set `TOKEN` to your Discord bot token.
2. Optionally set `DEFAULT_TIMEZONE`, `DYNASTY_MANAGER_ROLES`, and `BL_STAFF_ROLES`.
3. Keep `.env` and live database files private; do not commit secrets or production data.
4. Run `npm test` and `npm run release-audit` before deployment.
5. Deploy to a staging bot/server first and verify command registration, permissions, panel refreshes, and database backup/restore before promoting the release.

The startup preflight checks local configuration only; it does not prove that the token is valid with Discord or that the bot has the required live server permissions.


## Fix 102 — Database Write Safety

- Centralizes JSON database persistence in `utils/atomicJsonWrite.js`.
- Serializes and parses the proposed data before touching the live file, with a configurable validation guard.
- Writes to a uniquely named temporary file in the same directory, flushes file contents, and atomically renames the completed file into place.
- Cleans up temporary files on write failures and leaves the previous live database untouched when serialization or validation fails.
- `saveDatabase()` now refuses to persist a root value that does not contain a `dynasties` array.

Validation: run `npm test` and `npm run release-audit`. Atomic rename guarantees depend on the filesystem; live process-crash and power-loss behavior should still be checked in staging. This does not provide multi-process locking or a full transaction system.


## Fix 103 — Database Concurrency & Conflict Protection

- Tracks the exact database file snapshot loaded by each in-memory database object.
- Rejects a save when the on-disk file changed since that snapshot was loaded, instead of silently overwriting newer changes.
- Refreshes the snapshot baseline after a successful save so repeated saves of the same object continue to work.
- Uses an actionable `BLACKLINE_DATABASE_WRITE_CONFLICT` error code so callers and staff logs can identify a stale-write conflict.
- Adds regression tests for unchanged snapshots, changed snapshots, untracked objects, and fingerprint stability.

**Operational note:** this is optimistic conflict detection, not a merge engine. On a conflict, reload the latest database and retry the intended operation. Review command error handling and test concurrent workflows in staging before production deployment. It does not provide a distributed lock for multiple bot instances that write at exactly the same time.


## Fix 104 — Website Integration & Authenticated League Request Portal

- Integrated the existing `blackline-website` in the bot package and corrected its default data path to `data/dynasties.json`.
- Added Discord OAuth2 login with state validation and server-side verification that the account belongs to the configured BLACKLINE Discord server.
- Added role-ID based member / manager / staff access tiers. Protected APIs authorize on the server, not based on frontend visibility.
- Added CSRF protection, HttpOnly SameSite cookies, rate limiting, request-size limits, security headers, and no-store API responses.
- Added a member request portal and staff-only queue for support, team assignment requests, league issues, and feature suggestions. Queue status changes are audited and written atomically.
- Kept public league data read-only and explicitly allowlisted. Website requests do not directly mutate `dynasties.json`, avoiding a second writer racing the bot's Fix 103 optimistic concurrency protection.
- Added website integration smoke tests for configured data loading, private-field omission, unauthenticated request denial, and path traversal rejection.

**Configuration required before deployment:** set the Discord OAuth application credentials, exact redirect URI, server ID, and staff/manager role IDs in the private environment. Live OAuth, real Discord roles, and production hosting were not testable in this local package build. Direct league-changing operations remain bot-owned workflows; the portal queues requests for staff review and does not falsely report that a request was executed.


## Fix 107 — Live League Workspace (read-only)

The website dynasty detail page now loads a dedicated live workspace from `GET /api/dynasties/:id/workspace`. The response includes current-season schedule entries, finalized scores, a standings table calculated only from finalized numeric scores, published team names/assignments, summary counts, and the source file's last-updated timestamp. The endpoint returns only allowlisted public fields and does not expose coach Discord IDs, credentials, guild identifiers, or private connection settings. Unknown dynasty IDs return 404; unavailable or malformed data returns a controlled service error.

The website renders this schedule and standings view on each dynasty page. It remains read-only: team claims, score approval, recruiting changes, and season advancement are not executed by this endpoint. Those actions still require a bot-owned operation bridge that invokes existing validation and concurrency protection.


## Fix 108 — Website team claim execution bridge

The website now supports authenticated team claims for already-registered coaches. Claims are queued as individual action files and executed by the bot process, which rechecks coach membership and team availability, then saves through the existing database concurrency guard. Successful claims can trigger Discord role, team panel, and dashboard refreshes. Other website operations such as score finalization, recruiting edits, and season advancement remain unimplemented as direct website actions and continue to require existing bot workflows.


## Fix 109 — Website score-report execution bridge

- Adds an authenticated website score-report endpoint with CSRF protection, per-user rate limiting, strict numeric bounds, and coach/team-assignment checks.
- Queues reports to the bot-owned website action bridge. The bot revalidates the current season, coach registration, assigned team, duplicate pending reports, and score integrity before creating a pending score report.
- Posts valid reports to the configured Discord competition channel using the existing approve/reject button workflow. Official schedule results and standings are unchanged until a manager approves the report.
- In the website dynasty workspace, signed-in users get a structured score form. All score submissions remain pending manager approval.
- If Discord cannot accept the review post, the pending record is rolled back and the website action is marked rejected rather than leaving an invisible report.

### Score-report requirements

The bot must be running, Discord must be configured, the dynasty must have a `competitionChannelId`, the user must be a registered coach with a selected team in the matchup, and the configured channel must permit the bot to send messages. Use the website `README.md` for OAuth and role configuration.

## Website recruiting action bridge (Fix 111)

Signed-in coaches can submit recruiting prospect updates from the dynasty website page. The website accepts only the statuses `Interested`, `Offered`, `Visiting`, and `Committed`; it does not allow members to mark prospects `Signed`. Both the website API and the bot action worker verify that the submitting Discord user is a registered coach and currently assigned to the target team. The bot rechecks the active season, team registration, position, and 1–5 star rating before calling the existing `upsertProspect` logic, which maintains recruiting status history. Actions are written to the `data/website-actions` queue and processed by the bot process. The signed status remains a staff-controlled operation through the existing `/league recruit-prospect` workflow.

Website recruiting updates require Discord OAuth to be configured, the bot process to be running, and the coach to have an assigned team in the selected dynasty.

## Fix 126 — Unified player and prospect profiles

The dynasty workspace now includes a read-only player/prospect profile browser backed by the published feature API. It combines matching named records from roster players, recruiting prospects, player development history, development transitions, graduates, draft history, and recruiting history. Profiles can be searched and filtered by team; each profile shows the available position/rating/status fields and expandable source-history details. If no matching records are published, the UI explains that the underlying bot data is required instead of inventing player data. Private identifiers and credential-like fields are filtered from displayed history. The view does not mutate dynasty data or change bot-side authorization.

Validation: run `npm test` and `npm run release-audit`. Profile coverage depends on player/prospect records actually stored in the dynasty data.

## Fix 127 — Player statistical leaderboards

The dynasty workspace now includes a player-leaderboard panel that reads published player-stat feature records from the existing features API. It recognizes player-stat source families such as `playerStats`, `playerStatistics`, `weeklyPlayerStats`, `playerGameStats`, `playerSeasonStats`, `seasonPlayerStats`, `statLeaders`, `playerStatLeaders`, and `playerBoxScores`. Numeric performance fields can be selected as the leaderboard metric; rows are sorted highest-first and limited to the top 25 records with a value for the selected metric. The panel explicitly shows an empty-state message when the bot has not published player-stat records. It does not invent statistics or alter official league data. Different metrics may have different units, so users should compare only within the selected statistic.


## Fix 130 — Player leaderboard team and position filters

The player leaderboard now includes independent Team and Position selectors populated from the published player-stat records. They work alongside statistic selection, data-source filtering, and text search, and refresh the displayed ranks and match count without changing source data. Records without a team or position remain accessible through the All teams and All positions options.


## Fix 132 — Leaderboard reset and safer CSV export

- Added a Reset filters control that restores the default statistic, clears source/team/position filters and search, and rerenders results.
- Hardened CSV text-cell output against spreadsheet formula injection by prefixing dangerous text values while preserving numeric statistic values.
- Automated regression tests cover reset wiring and CSV formula-injection mitigation.


## Fix 135 — Player leaderboard quick-clear search

Added a dedicated **Clear search** control beside the player leaderboard search field. It clears only the search text, returns keyboard focus to the search input, and immediately refreshes the leaderboard while preserving the active statistic, sort order, row limit, data source, team, and position filters. The existing **Reset filters** action still resets every filter.

Validation: `npm test` and `npm run release-audit`. Live Discord behavior is not verified by these local checks.


## Fix 136 — Player leaderboard statistic summary

Added a live summary above the leaderboard table showing the current leader and value, average value, and minimum-to-maximum range for the selected numeric statistic after applying source, team, position, and search filters. The summary updates with the active sort and filters, safely escapes published text, and shows a clear empty state when no records match. The match count and summary use polite live-region announcements for assistive technology.

Validation: automated regression tests and the release audit should be run before packaging. These checks do not deploy the bot or verify live Discord permissions/API behavior.


## Fix 137 — Player leaderboard summary CSV export

- Added an **Export summary CSV** action alongside the full filtered leaderboard export.
- The summary export respects the active statistic, search, data-source, team, and position filters.
- Exports matching record count, leader and leader value, average, minimum, and maximum when matching numeric records exist.
- Uses quoted CSV cells and formula-injection protection for string values, with a UTF-8 BOM for spreadsheet compatibility.
- Existing leaderboard CSV export and row-limit behavior remain unchanged.


## Fix 138 — Filter-aware leaderboard summary CSV

- Summary CSV now records the active sort order, data source, team, position, and search text so exported metrics have context.
- The exported leader follows the selected highest-first or lowest-first order, matching the on-page summary.
- Existing numeric aggregates, CSV quoting, formula-injection safeguards, and UTF-8 BOM remain in place.

## Fix 139 — Team Logo Repair and Panel Refresh Diagnostics

- `/teams emoji-sync` now accepts an optional `force: true` setting to replace stale saved team-logo assignments when matching accessible Discord emojis are found. The default remains conservative and preserves existing manual assignments.
- The sync result reports whether it ran in preserve or replacement mode, making logo repair behavior explicit.
- If a logo still does not change, verify that a matching custom emoji is accessible to the bot/application and inspect the bot console for Discord API import errors.
- `/panels refresh` still refreshes existing panels in sequence. If Discord reports that the application did not respond, check the bot process is online and inspect its console for `Bulk panel refresh failed` or `BLACKLINE interaction error` messages; this release cannot verify live Discord permissions or API access from offline tests.

## Fix 140 — Creator Feed Foundation

- Added a Creator Feed page at `/community.html`, linked from the website navigation.
- Signed-in Discord members can publish text posts and optional HTTPS clip links; community posts are stored in `data/website-community.json` (or `WEBSITE_COMMUNITY_PATH`).
- Feed submissions require a valid website session and CSRF token, are rate-limited, validate content lengths and HTTPS clip URLs, and are written atomically.
- Public feed reads return published posts only; rendering escapes user content and opens clip links with `noopener noreferrer`.
- This is the first community-feed foundation, not the complete streaming integration: direct video uploads, comments/reactions, Twitch/Kick/YouTube OAuth, live detection, and automatic Discord announcements remain future work and require platform setup.


## Fix 141 — Creator Feed Reactions

- Added authenticated Like/Unlike reactions to community feed posts.
- Reaction state is stored with the post in the existing community data file and persists across reloads.
- Like endpoint requires an authenticated Discord session, CSRF token, and rate limit; missing posts return 404.
- The feed shows the current user's liked state and reaction count.
- Direct video uploads, comments, and platform live detection remain future work.


## Fix 142 — Creator Profiles & Stream Links

Adds an authenticated creator profile form to `/community.html`. Members can save a display name, short bio, and HTTPS profile links for Twitch, Kick, YouTube, and Streamable. Profiles are persisted separately at `data/website-creator-profiles.json` (override with `WEBSITE_CREATOR_PROFILES_PATH`). Stream links are validated against their expected domains. This release stores profile links only; OAuth account linking and automatic live status polling/webhooks are not included yet.


## Fix 143 — Public Creator Directory

Adds `GET /api/creators`, a public directory feed containing only creator display names, bios, supported platform URLs, and update timestamps. It deliberately omits Discord user IDs and private session/account data. `/community.html` now renders a responsive directory and safely escapes profile text and link labels. The directory displays links only; it does not claim live status or automatically announce streams. Profiles remain stored in `data/website-creator-profiles.json`.


## Fix 144 — Stream Status Integration Foundation

- Adds public `GET /api/stream-status` for currently-live channels.
- Adds authenticated publisher `POST /api/stream-status` for a trusted polling/EventSub worker.
- Configure `STREAM_STATUS_WEBHOOK_SECRET` in the existing project `.env`; publishers send `Authorization: Bearer <secret>`. Never expose this secret in browser code or Discord messages.
- Accepted providers: Twitch, Kick, YouTube. Live updates require a valid HTTPS provider URL; offline updates remove the matching channel from the live list.
- Adds a Live Now section to `/community.html`. This is the receiving/status foundation only; it does not itself poll providers or subscribe to Twitch/Kick/YouTube events.


## Fix 145 — Live Stream Discord Announcements

- When a trusted stream-status publisher reports a channel changing from offline to live, the website can post a Discord embed using `DISCORD_STREAM_WEBHOOK_URL`.
- Repeated live updates do not resend the announcement; a subsequent offline event removes the live status so the next live transition can announce again.
- Discord webhook URLs are restricted to HTTPS Discord webhook endpoints. Mentions are disabled to prevent accidental mass pings.
- Configure `DISCORD_STREAM_WEBHOOK_URL` in the project `.env` and `STREAM_STATUS_WEBHOOK_SECRET` for the trusted publisher. Keep both secrets private.
- This sends announcements from a Discord webhook, not a bot account. Platform detection still requires a separately configured Twitch/Kick/YouTube monitor to post authenticated updates to `/api/stream-status`.

Validation: run `npm test` and `npm run release-audit`. Live Discord delivery requires a configured webhook and was not verified in this build environment.

## Fix 146 — Twitch live monitor

BLACKLINE now includes an opt-in Twitch Helix polling process that reports real live/offline status to the website stream-status endpoint. Add these values to the existing project-root `.env` (never share the values publicly):

```dotenv
TWITCH_CLIENT_ID=your_twitch_app_client_id
TWITCH_CLIENT_SECRET=your_twitch_app_client_secret
TWITCH_CHANNELS=channel_one,channel_two
STREAM_STATUS_WEBHOOK_SECRET=your_existing_stream_status_secret
# Optional; minimum 60000 milliseconds, default 120000
TWITCH_POLL_INTERVAL_MS=120000
# Optional; defaults to local website
# BLACKLINE_STREAM_STATUS_ENDPOINT=http://127.0.0.1:3030/api/stream-status
```

Create a Twitch application in the Twitch developer console and use its app client ID and secret. Run the website and then, in a second terminal from the project root, run `npm run monitor:twitch`. Keep that monitor process running. It polls Twitch using app authentication, then sends authenticated live/offline status updates to BLACKLINE. The monitor uses a 60-second minimum interval and supports up to 100 configured channel names. Twitch is implemented in this release; Kick and YouTube still need their own official API integrations. This does not set up OAuth account linking, and successful Discord announcements still depend on valid webhook configuration and Discord availability.
