# departure-board

A pure NJ Transit rail departure board — just your trains, destinations, tracks, and status. No Amtrak, no bus/light rail, no station alerts, no announcements.

Tap a departure for its **stops**: every station that train calls at, with the estimated time at each.

Built with Next.js (App Router), TypeScript, and Tailwind CSS. Installable as a home-screen app on iPhone/Android/iPad.

## Development

```bash
npm install
npm run dev
```

Requires NJ Transit RailData API credentials from
[developer.njtransit.com/registration](https://developer.njtransit.com/registration).
Copy `.env.example` to `.env.local` and fill in:

```
NJT_API_USERNAME=
NJT_API_PASSWORD=
```

Without them the app serves stand-in departure and stop data, so it still runs.

> **Host:** requests go to `https://raildata.njtransit.com/api`. NJ Transit's
> developer portal documents `raildata.njt.gov`, but that name currently has no
> A record and cannot be reached; `njtransit.com` is what actually serves
> traffic, and what NJ Transit's own DepartureVision site calls. Set
> `NJT_API_BASE_URL` to switch once the `.gov` host comes up.

## A note on the API token

NJ Transit allows only **10 `getToken` calls per day**, so the token has to be
reused across requests rather than fetched per request. It is held with Next's
`use cache` (see `lib/njtClient.ts`) and refreshed on demand when the API
reports it has gone bad.

On Vercel that cache is backed by the Data Cache, which persists across
serverless invocations. **Self-hosting is different:** with plain `next start`
the default cache is per-process, so every restart costs another token — enough
restarts in a day and the app will start failing with a daily-limit error. If
you self-host, configure a [custom cache
handler](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheHandler)
backed by shared storage.

Departure data is cached separately, in a plain in-process map, because
throwing across a `use cache` boundary loses the error type the token-refresh
path depends on. Its limit (40,000/day) is loose enough that per-instance
caching is fine.

Stops are a second data call, `getTrainStopList`, cached the same way and
against the same 40,000/day limit. It has to be its own request: NJ Transit's
API manual notes that `getTrainSchedule19Rec` — the board's endpoint — returns
DepartureVision's data "but without train stop list information". Its `TIME`
field is an *estimated* arrival, not a timetable time, and comes back empty for
stops far enough down the line, which is why the stops view shows a dash there
rather than treating it as an error.

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — production build
- `npm run start` — serve a production build
- `npm run lint` — ESLint
- `npm run build-stations` — regenerate `lib/stations.json` from NJ Transit's station data (only needs to be re-run if the station list changes)
- `npm run build-icons` — regenerate the app icons from one SVG source (needs `sharp`, which is not a dependency: `npm i -D sharp` first)
