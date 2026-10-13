# BLACKLINE Dynasty Network Website

The existing dark, responsive BLACKLINE multi-dynasty website is integrated into the bot project. It serves public league overview data, supports Discord OAuth sign-in, verifies membership and role IDs against the configured Discord server, and provides an authenticated request queue with a staff-only review view.

## What is included

- Existing network homepage, dynasty directory, filters, and league detail pages
- Correct default data path for the website nested inside `Blackline Bot`: `data/dynasties.json`
- Read-only, allowlisted `/api/dynasties` endpoint; private credentials, coach Discord IDs, and league connection passwords are not returned
- `/api/health` status endpoint
- Discord OAuth2 login and server-side guild membership verification
- Role-ID based Member / Manager / Staff permissions, evaluated on the server for every protected request
- CSRF protection for state-changing requests, HttpOnly session cookies, OAuth state validation, rate limits, security headers, and request size limits
- Member request submission for general support, team assignment, league issue, and feature suggestions
- Staff-only request queue with review / complete / reject statuses and an append-limited audit trail
- Authenticated `/api/me/dashboard` endpoint showing only the signed-in coach’s matching league memberships and team assignments
- Authenticated `/api/my-requests` endpoint showing only the signed-in member’s own request history and staff notes
- Member portal dashboard for league memberships, team assignment, timezone, and request status
- Atomic JSON writes for the website request queue; website requests do not directly mutate the live league database
- No extra npm dependencies; Node.js 18+ is required

## Local setup

1. Keep `blackline-website` inside the `Blackline Bot` project folder as packaged.
2. Install the bot's existing dependencies from the `Blackline Bot` folder with `npm install` if you have not already done so. The website server itself uses Node built-ins and does not require a separate install.
3. Copy `.env.example` to `.env` in the `Blackline Bot` folder. Keep `.env` private and never commit it.
4. Configure the Discord OAuth values below in the project-root `.env`. The website loads that file automatically; start it from either the project root with `node blackline-website/server.js` or the website folder with `node server.js`.
5. Open `http://localhost:3030`.

The website resolves its default database path to `Blackline Bot/data/dynasties.json`. If the bot database is elsewhere, set `DYNASTY_DATA_PATH` to its absolute path. The site will report a data connection error if that file is absent; it no longer silently treats sample preview data as live league data.

## Discord OAuth configuration

In the Discord Developer Portal, open your bot application's OAuth2 settings and add the exact redirect URI, for example `http://localhost:3030/auth/callback` for local development. Configure these private environment variables in `.env` / the hosting platform:

- `DISCORD_CLIENT_ID` — application client ID
- `DISCORD_CLIENT_SECRET` — OAuth2 client secret; server-side only
- `DISCORD_REDIRECT_URI` — must exactly match the Developer Portal redirect URI
- `DISCORD_GUILD_ID` — Discord server whose membership grants access
- `BLACKLINE_STAFF_ROLE_IDS` — comma-separated Discord role IDs for staff
- `BLACKLINE_MANAGER_ROLE_IDS` — comma-separated Discord role IDs for league managers

OAuth requests use `identify` and `guilds.members.read`. The logged-in user must belong to the configured server. Permissions are based on role IDs, not display names, and are checked by the server; hiding a button in the browser is not treated as authorization. If role ID lists are empty, users are ordinary members and staff-only review is denied.

## Request queue and live league actions

Members can submit requests in the portal. Staff can review and update request status. These are **requests for review**, not direct league mutations. This is intentional: the bot's Fix 103 database uses optimistic snapshot conflict protection, and a website process must not overwrite a stale copy of `dynasties.json`. Fix 108 adds a bot-owned worker for team claims. The website queues a structured action in a dedicated per-action JSON file; the bot process re-loads the current database, verifies the submitter is a registered coach in that dynasty, validates availability through the existing `claimTeam` helper, and saves through the existing optimistic concurrency guard. When available, the worker refreshes the Discord team panel, dynasty role, and dashboard. The website reports the action status to the submitting member. Score reporting, recruiting changes, and season advancement remain review-only requests until their own bot-owned workflows are connected. The queue is intended for a single local/persistent filesystem, not multi-instance deployment.

## Production deployment checklist

- Use HTTPS; configure the platform proxy and set `NODE_ENV=production` so cookies are marked `Secure`.
- Store OAuth credentials as host secrets, never in frontend files or a committed `.env`.
- Use a persistent disk or migrate requests/audit to a transactional database. The JSON queue is for a single server/local filesystem, not multi-instance deployments.
- Back up `data/dynasties.json` before deployment and verify bot and website share the intended data volume.
- Restrict network access as appropriate, monitor logs, and test sign-in with member, manager, and staff test accounts.
- Verify OAuth redirect URI, guild membership checks, role IDs, and browser cookie behavior in staging before inviting real members.

## API endpoints

- `GET /api/health` — basic health, data connection, and OAuth configuration status
- `GET /api/dynasties` — safe public dynasty overview fields only
- `GET /api/me` — current signed-in user and role tier (no access token returned)
- `GET /api/me/dashboard` — authenticated coach membership dashboard; only matches the current Discord user ID
- `GET /api/my-requests` — authenticated request history scoped to the current Discord user
- `POST /api/team-claims` — authenticated, CSRF-protected team claim submission; requires an existing coach membership
- `GET /api/my-actions` — authenticated action status scoped to the current Discord user
- `GET /auth/discord` and `GET /auth/callback` — Discord OAuth2 flow
- `POST /auth/logout` — CSRF-protected sign-out
- `POST /api/requests` — authenticated request submission
- `GET /api/requests` — staff-only request queue
- `PATCH /api/requests/:id` — staff-only status update

## Platform tools hub (Fix 105)

The website now includes a platform-tools directory covering the bot's major feature families: league control, schedule/readiness, season advancement, standings/rankings, playoffs, recruiting, rosters/player development, awards, coach center, program center, record books, rivalries, polls, news/activity, competition center, staff operations, data health/recovery, and Discord panels. Each module page links to connected dynasty summaries and can prefill a request for that module. The member request form supports typed requests for schedule/results, recruiting, roster, awards, playoffs, polls, disputes, staff actions, recovery, and panel repair. The staff queue displays module context.

**Important boundary:** a module directory is not the same as porting every Discord interaction to a browser. The current safe website APIs expose published dynasty summaries and a request queue. They do not yet expose every bot utility's private data or execute score entry, team claims, recruiting edits, season advancement, database recovery, or panel updates directly. Those need bot-owned execution endpoints that re-check Discord roles, validate inputs, reload the latest database snapshot, invoke the existing business logic, and write audit records. Do not enable direct JSON edits from the website or describe a queued request as an executed operation.


## Fix 106 — Member dashboard and request tracking

The portal now fetches the signed-in coach’s league memberships and their own submitted request history. The membership endpoint only returns a limited allowlist of fields and only matches coach records against the current Discord user ID. Request history is filtered by the authenticated submitter ID and does not expose other members’ requests. These endpoints are read-only; live team changes and other league-changing actions still require the bot-owned execution bridge.


## Fix 108 — Website-to-bot team claim bridge

Signed-in registered coaches can choose an available team from the dynasty page. The website does not write to `dynasties.json`; it writes a separate action record. The bot polls the action queue every three seconds, re-validates membership and team availability, and uses the existing team-selection helper and concurrency-protected database writer. The browser cannot claim a team simply by hiding another team option; the bot re-checks all constraints. Other live actions are not enabled by this release.


## Fix 109: Website score reporting

Signed-in registered coaches can submit a final score from a dynasty workspace. The website validates input and queues the request; the bot revalidates it and posts it to the existing Discord competition channel with the existing manager approve/reject controls. A score is not official and standings do not change until a manager approves it in Discord. Configure the bot and competition channel as you do for Discord-native score reports.

## Fix 110 — Full feature portal and connected data hub

The platform module pages now include a dynasty selector and a live feature workspace backed by `GET /api/dynasties/:id/features`. It exposes only selected public league records when present in the dynasty database: schedules/results, standings/rankings, playoff and championship history, recruiting prospects/history, roster and player development, awards, coach/program history, polls/community notifications, league rules, and pending score reports. Public projections recursively remove user/Discord IDs, guild/channel/message IDs, credentials, tokens, and other sensitive-keyed fields; records and nested values are capped to keep responses bounded.

This is a broad website surface for published bot data, not a claim that every Discord command has become a browser-executable mutation. Team claims and score reports use the bot-owned worker; other write actions continue through the authenticated staff-review request queue until their exact existing command logic can be safely called by a bot-owned action handler. Season advancement, recovery, and panel repair remain staff-controlled and should not be triggered by direct website JSON writes.

New endpoint:
- `GET /api/dynasties/:id/features` — curated, sanitized published feature data for the selected dynasty.


### Website recruiting updates (Fix 111)

The dynasty detail workspace includes a recruiting tracker for authenticated coaches. Updates are queued for the bot process and revalidated there; the coach must be registered and assigned to the selected team. Supported statuses are Interested, Offered, Visiting, and Committed. Signing a prospect remains a staff-only action.

### Fix 114 — Reliable environment loading and website QA

The website now loads the project-root `.env` automatically, whether launched with `node blackline-website/server.js` from the project root or `node server.js` from the website folder. Existing environment variables supplied by the shell/host remain authoritative. A built-in `.env` parser fallback is used only if the project's `dotenv` package is unavailable.

Run the full regression suite from the project root with `node --test`. The website regression tests include a startup check proving OAuth configuration is loaded without the `-r dotenv/config` launch flag.

### Fix 115 — Staff request review workflow

The staff-only request queue now supports searching by title, request type, module, member, or dynasty; filtering by status; refreshing the queue; changing a request to any supported lifecycle status; and saving an optional staff note with the status update. Existing staff notes are displayed on the request card and remain visible to the original submitter in their own request history. Every update still goes through the server-side staff authorization and CSRF checks and is recorded in the audit trail. This improves review workflow only; it does not execute a queued league mutation.


### Fix 116 — Member action tracking and truthful capability status

The signed-in member dashboard now includes a **My bot actions** feed using the existing authenticated `GET /api/my-actions` endpoint. It shows the action type, current bot status, submission time, dynasty, and the bot's result message for team claims, score reports, and recruiting updates. Failed actions tell the member to contact staff instead of implying success. The dashboard also clearly reminds members that score reports are not official until manager approval in Discord.

The platform landing copy now reflects the currently supported bot-owned bridge (team claims, recruiting updates, and score reports) and distinguishes those from operations that remain staff-reviewed. This is status visibility, not a new permission path; action execution and data writes remain owned by the bot.


### Fix 117 — Member dashboard refresh and action clarity

Members can manually refresh their league memberships, requests, and bot-action history without reloading the whole site. The dashboard shows a last-updated time, disables the refresh control while fetching, and displays a visible error if refreshing fails. Bot actions now have clearer status labels and include available context such as the reported matchup and score or claimed team. This remains a read-only view: it does not retry actions or bypass bot-owned validation and manager approval.


## Fix 118 — Member action filters

The member dashboard can filter the signed-in user's bot action history by status (queued, processing, completed, approved, rejected, failed, pending) and action type (team claim, score report, recruiting update). The counts update to show matching actions versus total actions, and a clear-filters control restores the full list. Filters affect presentation only; they do not alter action records, permissions, or bot processing.


## Fix 119 — Recruiting action queue integrity

Recruiting updates now store their recruiting lifecycle value in `prospectStatus`, separate from the action queue's `status` (`queued`, `processing`, `completed`, `rejected`, or `failed`). The bot worker reads the dedicated field and retains compatibility with older queued records. The member action API exposes the prospect's name, position, stars, and recruiting status so the dashboard can show meaningful details. This fixes a key collision that previously caused recruiting submissions to fail queue validation.

## Fix 120 — Complete published scores and rankings workspace

- Expands the live dynasty workspace to show full season standings with rank, W-L-T record, win percentage, points for/against, point differential, and games played.
- Adds the latest published season power rankings, including the publication timestamp when available.
- Adds conference standings based on saved `teamConferences` assignments, recent final scores, and team scoring averages derived only from finalized games.
- Includes teams with zero completed games so early-season standings do not hide them.
- Keeps ranking order sourced from the latest saved season ranking; calculated standings remain separate from staff-published power rankings.
- Strengthens public feature-data filtering to omit audit attribution fields such as `updatedBy`, preventing Discord user IDs from leaking through published ranking metadata.
- All data remains read-only on the website. Score reports do not affect official standings until the bot's existing manager approval workflow saves a final result.

Validation: `npm test` (285 passed) and `npm run release-audit` passed. Live Discord processing and a specific production dynasty database must still be checked in the user's environment.


## Fix 121 — Playoff and league-history workspace

The live league workspace now includes sanitized published playoff brackets, championship history, conference champions, award history, and program record history alongside scores, standings, rankings, and schedule data. Records are rendered as readable cards, with bounded output and private attribution fields excluded. The website remains read-only for these records; authoritative changes must still be published by the bot.


## Fix 122 — Player & recruiting data discovery

The published feature workspace now has a search field and category selector. Members can search the records currently published by the selected dynasty—including roster/player records, recruiting prospects and history, awards, and program history—without changing or mutating the underlying dynasty data. Empty categories remain clearly represented, and the controls work on mobile layouts. This is a read-only discovery improvement; the bot must publish a record for it to appear.


## Fix 123 — Complete feature-record search

The published feature workspace now searches and filters individual records across the full returned feature list, rather than searching only the first 12 displayed records or hiding/showing an entire category based on a match elsewhere in that category. The result counter reports matching records and visible categories. This remains a read-only view of the dynasty data published by the bot.


## Fix 124 — Season score history

The dynasty workspace now summarizes finalized games across all seasons stored in `scheduleGames`, separately from current-season standings. It reports games played, participating teams, total points, points per game, and the highest-scoring recorded matchup per season. Only records whose status is exactly `final` and which have both scores and named teams are included; pending/unapproved reports are not read from the score-report queue. Historical rows appear only when the bot retains those seasons in the dynasty data.


## Fix 125 — Unified team profiles

The live dynasty workspace now includes a team profile selector. For each published team it combines current-season standing/record, published power rank, coach assignment, point differential, and that team's schedule with finalized results or upcoming status. All displayed values are derived from the existing workspace API response; it does not mutate dynasty data or bypass score approval. Teams without published games or assignments display explicit empty states. The layout adapts to narrow screens.

Validation: run `npm test` and `npm run release-audit`. Live database coverage depends on the fields stored in the user's dynasty data.


## Fix 128 — Player leaderboard search and tie-aware ranks

- Added a search box for player name, team, position, and data source.
- Added competition ranking for ties (for example, 1, 1, 3) instead of assigning different ranks to equal values.
- Displays matching-record counts and a clear empty-search message.
- Keeps the top-25 display cap and uses published numeric statistics only.
- No `.env` or live dynasty data is included in the patch archive.


### Fix 129 — Player leaderboard data-source filtering

- Added a data-source selector to the player leaderboards so published game, weekly, season, and other player-stat records can be isolated instead of being viewed only in one combined list.
- Search, numeric statistic selection, tie-aware competition ranks, and the 25-row display continue to work with the selected source.
- The default remains **All sources**; choose a specific source when comparing like-for-like records.
- Automated source-level regression coverage added.


## Fix 131 — Filtered player leaderboard CSV export

Player Leaderboards now includes an **Export filtered CSV** control. The export uses the current statistic, source, team, position, and text-search filters; includes all matching rows (not only the 25-row on-screen preview); preserves tie-aware competition ranks; and quotes CSV cells to protect commas and quotation marks in names or labels. The file is generated in the browser and does not upload data to a third party.

## Fix 133 — Player leaderboard sort order

- Added a **Highest first / Lowest first** control for numeric player statistics.
- Applies the chosen order consistently to the visible leaderboard and CSV export.
- Filter reset restores the default highest-first order; tie-aware competition ranks remain based on the selected ordering.
- This is a read-only presentation change and does not alter published bot data.


## Fix 134 — Player leaderboard visible row limit

- Added a **Rows shown** selector for 25, 50, 100, or all matching player-stat records.
- The visible result count continues to distinguish matching records from displayed rows.
- Filter reset restores the default 25-row preview; CSV export still includes every matching record.
- This read-only display setting does not alter bot data.
