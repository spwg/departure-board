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
CRON_SECRET=
# Leave unset for production RailData; npm run dev:njt-test supplies this.
# NJT_API_BASE_URL=https://testraildata.njtransit.com/api
```

The Redis variables are required when NJ Transit credentials are configured;
they provide shared token storage and locking. The Subway integration uses
official MTA GTFS-Realtime feeds and does not require project credentials.

## NJ Transit test backend

For local testing without consuming production RailData tokens, use NJ
Transit's test backend:

```bash
npm run dev:njt-test
```

This starts the same app with
`NJT_API_BASE_URL=https://testraildata.njtransit.com/api`. It still reads
`NJT_API_USERNAME`, `NJT_API_PASSWORD`, and the Upstash variables from your
ignored `.env.local`; do not commit credentials. Start a fresh dev server after
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
were given; the chip turns green when NJ Transit posts. History and a log of
everything the board showed live in the same Upstash Redis database as the
token and age out after 90 days. See
`docs/adr/0008-penn-predicted-tracks-and-board-log.md`.

### Always-on collector

History and the log need the board loaded around the clock, not just when
someone has it open. Run the app on any always-on machine with `next start`
and these set, alongside the NJ Transit and Upstash credentials:

```bash
PENN_COLLECTOR=true          # start the 30-second timer in this server
CRON_SECRET=<long random>    # guards /api/penn-positions/record
npm run build && npm start
```

Leave `PENN_COLLECTOR` unset on Vercel: functions are frozen between requests,
so a timer there would stop. `PENN_COLLECTOR_INTERVAL_SECONDS` changes the
interval (default 30, minimum 10). The timer calls its own server on
`127.0.0.1:$PORT` (default 3000), so serve on a different port with `PORT=…`
rather than `-p`. Each load prints one JSON line
(`"event":"penn-collect"`) to the server log.

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

Do not commit `.env.local` or expose any of these values through a
`NEXT_PUBLIC_` variable.

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
