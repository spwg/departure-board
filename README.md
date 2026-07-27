# departure-board

A pure NJ Transit rail departure board — just your trains, destinations, tracks, and status. No Amtrak, no bus/light rail, no station alerts, no announcements.

Built with Next.js (App Router), TypeScript, and Tailwind CSS. Installable as a home-screen app on iPhone/Android/iPad.

## Development

```bash
npm install
npm run dev
```

Requires NJ Transit Rail Data Web Services API credentials. Copy `.env.example` to `.env.local` and fill in:

```
NJT_API_USERNAME=
NJT_API_PASSWORD=
```

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

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — production build
- `npm run fetch-stations` — regenerate `lib/stations.json` from NJ Transit's station data (only needs to be re-run if the station list changes)
