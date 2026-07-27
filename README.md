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

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — production build
- `npm run fetch-stations` — regenerate `lib/stations.json` from NJ Transit's station data (only needs to be re-run if the station list changes)
