# Security

What the site has worth protecting, who could attack it and how, and which
controls stop each attack. Some of those controls live in this repository and
some in the platforms it deploys to; both are described here, because removing
either kind reopens the same attack.

## What there is to protect

The site has no accounts, cookies or write endpoints, and stores nothing about
its visitors on a server: favorites and preferences stay in the browser's
`localStorage`. So the assets are few:

- **NJ Transit's daily allowance.** RailData allows 10 `getToken` calls and
  40,000 data calls a day for the whole account. Spending either takes every
  board down until midnight. This is the asset most exposed to attack.
- **Credentials.** The NJ Transit RailData username and password, and the
  Upstash Redis REST token. They live in Vercel's and Cloudflare's environment
  settings and in an ignored `.env.local`.
- **The integrity of what riders see.** A rider acting on a board that has
  been tampered with, or that passes old times off as current, could miss a
  train.
- **The deployment pipeline.** Pushes to `main` deploy both the app (Vercel)
  and the collector Worker (Cloudflare Workers Builds).

## Attack surface

- **Pages.** Prerendered App Router pages. They take only route segments
  (station codes, train numbers, Subway station and trip IDs) as input.
- **Six JSON routes under `app/api/`**, all `GET`. They read NJ Transit
  RailData, NJ Transit's advisory RSS feed, and MTA's GTFS-Realtime feeds.
- **The service worker** (`public/sw.js`), which caches same-origin `GET`
  responses for offline use.
- **The collector** (`collector/`), a Cloudflare Worker with a cron trigger
  and no HTTP handler. With `workers_dev = false` and `preview_urls = false`
  it has no public URL, so it cannot be reached from outside.
- **Upstream feeds.** NJ Transit's and MTA's responses are untrusted input:
  their text is shown to riders, and an advisory carries a link.

Trust boundaries: the visitor's browser and the upstream feeds are untrusted.
The app, the collector, Upstash, and the Vercel and Cloudflare accounts that
hold the credentials are trusted.

## Threats and controls

### Spending NJ Transit's allowance

Every request that misses the cache becomes a RailData call, and the inputs
are cheap to vary: 167 station codes and 9,999 valid train numbers.
Looping over `/api/stops/1` … `/api/stops/9999` from one machine would spend
the day's 40,000 calls in minutes.

Controls, outermost first:

1. **Vercel Firewall rate limit on `/api/`**, per IP. This is the control that
   stops a flood. It is a dashboard setting, not code.
2. **Vercel Authentication on preview deployments** (Standard Protection).
   Previews run with the production NJ Transit credentials, so an open preview
   URL would be a second way in that skips the production domain. Only
   logged-in members of the Vercel team can open one.
3. **Per-instance call budget** (`lib/njtCallBudget.ts`). Each app instance
   may make 40 RailData data calls at once and 20 a minute sustained. Past
   that, a cache miss answers 503 with `Retry-After` and `kind: "upstream"`,
   so the page offers to try again. Fixture mode and the collector are not
   counted.
4. **Short shared caches with single-flight loading.** A station's board is
   shared for 20 seconds and a train's stops for 60, and concurrent misses for
   the same station or train wait on one call (`lib/departureBoard.ts`,
   `app/api/stops/[train]/route.ts`). An unknown train number is cached like
   any other, so repeating one costs nothing.
5. **Input validation before any upstream call.** Station codes must be in the
   station list, train numbers must match `/^\d{1,4}$/`, and Subway station
   and trip IDs must exist in MTA metadata. Anything else is a 404 that never
   reaches NJ Transit or MTA.

`getToken`'s 10 a day is protected separately (`lib/njtTokenStore.ts`): one
token is shared by every instance and the collector, minted only under an
Upstash lock, and a failed attempt starts a shared cooldown. A visitor cannot
cause a mint; only NJ Transit rejecting the token does.

### Exhausting server resources

Two routes take lists, and each item costs CPU: `/api/subway/departures/`
(comma-separated station IDs) and `/api/service-advisories` (repeated `line`
parameters). Both are deduplicated and capped, at 8 station IDs (the largest
complex has 5) and 4 line codes of up to 4 characters. MTA's feeds are fetched
once per feed family however many stations ask, and every upstream call has a
10-second timeout.

### Script injection

Text from NJ Transit and MTA reaches the page, so the feeds are the realistic
source of injected markup.

- React escapes everything rendered. The only `dangerouslySetInnerHTML` is the
  theme script in `app/layout.tsx`, which is built from constants.
- Advisory links are kept only when their scheme is `http:` or `https:`
  (`webLink` in `components/ServiceStatus.tsx`), so a feed cannot plant a
  `javascript:` link. External links open with `rel="noreferrer"`.
- The Content Security Policy (`next.config.ts`) limits every fetch directive
  to `'self'`, so even injected markup cannot load a script, frame, font or
  stylesheet from another origin, or send data to one.

### Clickjacking and cross-origin interference

`frame-ancestors 'none'` and `X-Frame-Options: DENY` stop other sites from
framing the board. `Cross-Origin-Opener-Policy: same-origin` cuts the link to
any window the site is opened from or opens. `Permissions-Policy` grants
location to this origin only, for nearby stations, and denies camera,
microphone, payment and USB.

### Request forgery

None of the endpoints change anything and the site sets no cookies, so a
forged request has nothing to act on and no session to ride.

### Server-side request forgery

Every upstream URL is a constant. Request input only becomes a form field sent
to NJ Transit, or a key to look up in local metadata, and only after the
validation above. No request can choose where the server connects.

### Credential exposure

- `.env*` (except `.env.example`), `.dev.vars*` and `.wrangler/` are ignored.
  The repository and its history hold no credentials.
- Error responses are generic. Upstream error bodies are logged, truncated to
  200 characters, but never returned to the browser.
- `InvalidTokenError` keeps the rejected token in a non-enumerable property,
  so logging the error leaves the token out.
- Request input never becomes a Redis key or a Lua argument; every key is a
  constant.
- CI checks out with `persist-credentials: false`, so the GitHub token is not
  on disk while dependency install scripts and tests run.

### Stale data presented as live

The service worker answers from its cache only when the network fails, and it
marks those responses `X-From-Cache` with the time they were last live, so the
board labels them as stale. Over the call budget the app answers 503 rather
than serving an older board, because the client judges freshness from the
response's `Date` header and would show old times as current.

### Supply chain

- Runtime dependencies are few: Next.js, React, `gtfs-realtime-bindings`, and
  Vercel's analytics. `package-lock.json` pins every transitive version.
- `.github/dependabot.yml` limits Dependabot to security updates, for npm and
  GitHub Actions.
- CI's actions are pinned to full commit SHAs, so a moved or compromised tag
  cannot change what runs.
- Both Vercel and Cloudflare deploy `main` automatically, so whoever can push
  to it controls production. Its GitHub branch protection (pull requests only,
  CI required, no force pushes) is part of the site's security, not only a
  workflow convenience.

## Residual risks

These are accepted, or depend on a decision not yet taken.

- **Inline scripts are allowed.** The CSP includes `script-src
  'unsafe-inline'`. Removing it needs per-request nonces, which would give up
  the prerendered pages Cache Components provides. Next's experimental
  Subresource Integrity support (`experimental.sri`) is the likely path. Until
  then, an injected inline script would run; the defense is that React escapes
  upstream text, so markup cannot become a script in the first place.
- **The call budget is per instance.** A flood spread across many instances
  gets each one's allowance. The Vercel rate limit is what bounds the total.
  The rate limit is per IP, so a distributed flood could still get through;
  Vercel's Attack Challenge Mode is the response to one in progress.
- **Previews share production's NJ Transit allowance.** Strangers cannot reach
  a preview, but team members testing on one spend the same daily calls as the
  live site. Pointing previews at the test backend (`NJT_ENV=test` with test
  credentials) or at fixtures (`NJT_USE_FIXTURES=true`) would separate them.
- **One Upstash token, full access.** The app and the collector share a REST
  token that can run any command on the database. A leak of either exposes
  both, and revoking it stops both. Upstash's ACL can issue each a credential
  limited to its own commands and the `departure-board:*` keys.
- **The CSP blocks the Vercel Toolbar** on previews, since its scripts come
  from `vercel.live`. That origin would have to be allowed for preview builds
  only (`VERCEL_ENV=preview`) to use it.
