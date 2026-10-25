# departure-board

A web-based departure board for NJ Transit rail and NYC Subway. Search or
browse stations, find nearby stations, save local favorites, and view live
departure information in a focused station view. The site is not a trip
planner and does not provide Amtrak, bus, or light-rail boards.

Built with Next.js (App Router), TypeScript, and Tailwind CSS. The site uses
provider-native data for each transit system and keeps their boards separate.

## Development

Requires Node.js 24, matching the version used by CI.

```bash
npm install
cp .env.example .env.local
npm run dev:fixtures
```

`npm run dev:fixtures` starts a UI-only local run using built-in NJ Transit
fixture data. It does not need NJ Transit credentials and is the quickest way
to work on the site locally. `NJT_USE_FIXTURES=true` forces fixture mode even
when credentials are present.

For live NJ Transit data, register for RailData API credentials at
[developer.njtransit.com/registration](https://developer.njtransit.com/registration).
These are the API credentials emailed during registration, not a
njtransit.com website login.

Copy `.env.example` to `.env.local` and set:

```text
NJT_API_USERNAME=
NJT_API_PASSWORD=
NJT_USE_FIXTURES=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# production or test; npm run dev:njt-test supplies test.
NJT_ENV=
```

The Redis variables are required when NJ Transit credentials are configured;
they provide shared token storage and locking. So is `NJT_ENV`, which names the
NJ Transit backend: `production` or `test`. It picks both the RailData host and
the Redis keys the token is stored under, because each backend rejects the
other's tokens. It has no default: with credentials set, an unset or unknown
value stops `next dev`, `next build` and `next start` with an error, so a
deployment that lacks it never goes live. The Subway integration uses
official MTA GTFS-Realtime feeds and does not require project credentials.

## NJ Transit test backend

For local testing without consuming production RailData tokens, use NJ
Transit's test backend:

```bash
npm run dev:njt-test
```

This starts the same app with `NJT_ENV=test`, which calls
`https://testraildata.njtransit.com/api` and keeps its token under its own
Redis keys, so it never disturbs production's token even in a shared Upstash
database. It still reads `NJT_API_USERNAME`, `NJT_API_PASSWORD`, and the Upstash
variables from your ignored `.env.local`; do not commit credentials. Start a fresh dev server after
changing environment variables. Verify it with:

```bash
curl http://127.0.0.1:3000/api/departures/NY
```

A successful live response has `"fixtures":false`.

The test backend has its own data and may return imperfect or stale labels. Use
it to exercise the integration and error states, not to validate current
operational train information.

## New York Penn predicted tracks

NJ Transit posts New York Penn tracks late. Before a train's track is posted,
the NY board shows a grey predicted track with its confidence ("95% likely"),
from the history of which track trains standing on the same signal circuit
were given; the chip turns into the green posted track when NJ Transit posts. History and a log of
everything the board showed live in the same Upstash Redis database as the
token and age out after 90 days. See
`docs/adr/0008-penn-predicted-tracks-and-board-log.md`.

### Collector Worker

Predictions need NJ Transit polled around the clock, not only while someone has
the board open, and without waking the Vercel app. A Cloudflare Worker
(`collector/`, free plan) runs once a minute: it calls NJ Transit itself,
records history, logs the board, and publishes current predictions to Upstash.
The app only reads those predictions back — one Redis read per fresh NY
board — and still loads departures and posted tracks from NJ Transit itself.

**Deploys are automatic.** The Worker is connected to this repository through
Cloudflare's Workers Builds, so every push to `main` redeploys it, the way Vercel
redeploys the app. Its build settings (Worker → Settings → Builds):

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `collector` |
| Build command | *(empty: the Worker uses no npm packages)* |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler versions upload` (uploads an inactive version; branches never go live) |

Each deploy replaces the code and keeps the secrets. Builds and their logs are
under the Worker's Deployments tab.

**Setting up from scratch** (a new Cloudflare account, or to recreate the
Worker), from the repository root:

```bash
npx wrangler@4 login        # browser sign-in to your Cloudflare account
npm run collector:deploy    # bundle collector/worker.ts, upload it, start the cron
for name in NJT_API_USERNAME NJT_API_PASSWORD UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN; do
  npx wrangler@4 secret put $name --config collector/wrangler.toml   # prompts for each value
done
```

then connect the repository under Settings → Builds with the settings above.
`npm run collector:deploy` also deploys by hand at any time, for example if
automatic builds are ever disconnected.

Use the same NJ Transit and Upstash values as the Vercel project, so both share
one NJ Transit token. `NJT_ENV = "production"` is set in
`collector/wrangler.toml`, not as a secret. Runs in the minute or two before the secrets are set fail
harmlessly and are logged. `collector/wrangler.toml` holds no secrets and is
committed; secrets live only in Cloudflare. Each run logs a one-line JSON summary
(`"event":"penn-collect"`) to Workers Logs. To run it locally, put the same
variables in `collector/.dev.vars` (ignored by git), start
`npx wrangler@4 dev --config collector/wrangler.toml --test-scheduled`, and
trigger a run with `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`.

**Alerts.** Cloudflare sends nothing when a scheduled run fails, so the
Worker can ping a free [Healthchecks.io](https://healthchecks.io) check after
every run that could predict (board, vehicle feed and history all answered).
Create a check with a period of 1 minute and a grace time of 10 minutes, then
`npx wrangler@4 secret put HEALTHCHECK_URL --config collector/wrangler.toml`
with its ping URL. You are emailed when pings stop for any reason — errors,
outages, the CPU limit, or a cron that never fires — and again when they
resume.

### Measuring accuracy

```bash
npm run penn-accuracy                 # last 14 days, reading .env.local
npm run penn-accuracy -- --days 90
```

It reports collection coverage, then precision, recall, F1, how often a rider
saw a wrong prediction, lead time before posting, calibration of the shown
percentages, and the same figures by month and by line.

## NJ Transit API token

NJ Transit allows only **10 `getToken` calls per day**, so the token is reused
across requests rather than fetched per request. The token is stored in Upstash
Redis, with an atomic lock ensuring that simultaneous cache misses cannot mint
several tokens. Next's Data Cache sits in front to avoid a Redis read on every
board refresh. The token is replaced only when NJ Transit reports that it has
gone bad.

A failed `getToken` starts a cooldown, kept in Redis, during which nobody tries
again: an hour after NJ Transit refuses (the daily limit, or credentials it
does not accept), two minutes after a network failure. Meanwhile NJ Transit
boards say live data is paused and when it resumes. If Redis itself is
unavailable, the app mints the token without it and keeps it in the Data Cache,
so boards keep loading; only predicted tracks wait for Redis to return.

Upstash bills each command a Lua script runs, not just the script; the
collector's budget is in
`docs/adr/0008-penn-predicted-tracks-and-board-log.md`.

Create a **Free** Upstash Redis database and set
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in local development and
in the deployed application's environment. Avoid putting credentials in
tracked files or exposing them through client-side environment variables.

Departure and stop data are cached briefly per server instance to stay well
below NJ Transit's 40,000-per-day data-call limit. The browser also labels
cached fallback data as stale rather than presenting it as live.

## Data sources and limitations

- NJ Transit rail departures and remaining-stop data come from the NJ Transit
  RailData API.
- NYC Subway departures and remaining-route data come from official MTA
  GTFS-Realtime feeds.
- NJ Transit service notices come from the official Rail Advisories RSS feed.
- Realtime information may be delayed, incomplete, stale, or inaccurate. Verify
  critical travel details with NJ Transit or the MTA before traveling.
- This site is not affiliated with, endorsed by, or licensed by NJ Transit.

## Deployment

The app is designed to deploy as a Next.js application, including on Vercel.
Set the following in the deployment environment for live NJ Transit data:

- `NJT_API_USERNAME`
- `NJT_API_PASSWORD`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NJT_ENV=production`

Do not commit `.env.local` or expose any of these values through a
`NEXT_PUBLIC_` variable.

## Performance

Page loads are covered by Vercel Speed Insights (Core Web Vitals) and Web
Analytics (page views). Neither sees the wait riders actually notice: the
departures load from `/api` after the page does. That wait is measured
separately:

- **Server time.** Every departures and stops response carries a
  `Server-Timing` header that splits it into NJ Transit, token, Redis
  predictions, MTA feeds and decoding, and says whether the instance's cache
  answered (`cache;desc="hit"`). DevTools shows it under the request's
  Timing tab. Each request that called upstream, failed or took over a second
  also writes one `api_timing` JSON line to the function logs; search
  Vercel's logs for `api_timing` (`lib/requestTiming.ts`).
- **Rider's wait.** When a board first shows departures it records a
  `board ready (njt|subway, load|in-app)` performance measure, with the
  server's share in its detail, and sends a "Board ready" event to Web
  Analytics with the board and a wait bucket (`lib/boardTiming.ts`). Custom
  events need a Vercel Pro or Enterprise plan.

A station page opened directly starts its departures request from
`instrumentation-client.ts`, before React hydrates, rather than after
(`lib/earlyBoardFetch.ts`).

## Scripts

- `npm run dev` — start the local dev server
- `npm run dev:fixtures` — start a local UI run with forced NJ Transit fixtures
- `npm run dev:njt-test` — start the local server against NJ Transit's test backend
- `npm test` — run the Node token-store tests and Vitest tests
- `npm run test:node` — run the Node token-store tests
- `npm run test:unit` — run the Vitest unit and component tests once
- `npm run test:watch` — run Vitest in watch mode
- `npm run lint` — run ESLint
- `npm run typecheck` — generate Next route types and run TypeScript checks
- `npm run build` — create a production build
- `npm run start` — serve a production build
- `npm run build-stations` — regenerate the NJ Transit station directory
- `npm run build-subway-stops <stops.txt> <output.json>` — generate Subway stop-name metadata
- `npm run build-subway-stations <stations.csv> <output.json>` — generate Subway station metadata
- `npm run build-subway-headsigns <trips.txt> <output.json>` — generate Subway headsign metadata
- `npm run build-icons` — regenerate app icons; requires `sharp` as a local development dependency

The repository's GitHub Actions workflow runs lint, typecheck, tests, and a
production build for pull requests and pushes to `main`.

## License

This project is released under the [MIT License](LICENSE).
