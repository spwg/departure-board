# Security

How the site is protected, what a review on 2026-10-24 found and fixed, and
the settings outside this repository that matter as much as its code.

## Attack surface

The site has no accounts, cookies or write endpoints. Everything a visitor can
reach is a GET: prerendered pages and six JSON routes under `app/api/` that
read NJ Transit RailData, NJ Transit's advisory RSS feed, and MTA's
GTFS-Realtime feeds. Preferences and favorites stay in the browser's
`localStorage`. The Penn collector (`collector/`) is a Cloudflare Worker with
a cron trigger only: it has no HTTP handler and no public URL.

The secrets are NJ Transit's API username and password and the Upstash Redis
REST token. They live in Vercel's and Cloudflare's environment settings and in
an ignored `.env.local`, never in the repository.

So the risks that matter are:

1. **Spending NJ Transit's quota.** RailData allows 10 `getToken` calls and
   40,000 data calls a day for the whole account. Exhausting either takes the
   site down for every rider until midnight.
2. **Leaking a secret** through code, logs, error responses or CI.
3. **Script injection** through upstream text shown on a page.
4. **The supply chain**: npm dependencies, GitHub Actions, and the accounts
   that deploy `main` automatically.

## What the review found

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Any client could spend the day's NJ Transit data calls in minutes by requesting `/api/stops/1` … `/api/stops/9999`: every train number is its own cache entry. | High | Mitigated in code. Also needs a platform rate limit (below). |
| 2 | Concurrent requests that missed the departures or stops cache each called NJ Transit. | Medium | Fixed: one call per station or train at a time. |
| 3 | `/api/subway/departures/` took any number of comma-separated station IDs, and `/api/service-advisories` any number of `line` parameters. Each costs CPU per item. | Low | Fixed: at most 8 station IDs (the largest complex has 5) and 4 short line codes, deduplicated. |
| 4 | The Content Security Policy did not restrict script sources, so injected markup could load a script from anywhere. | Medium | Fixed: every fetch directive is `'self'`. |
| 5 | No `Strict-Transport-Security`, `Permissions-Policy` or `Cross-Origin-Opener-Policy`; `X-Powered-By` advertised Next.js. | Low | Fixed. |
| 6 | `npm audit` reported 7 advisories (5 high) in transitive packages: `undici`, `vite`, `vitest`, `zod`, `markdown-it`, `source-map-js`. All are build, lint or test tooling, not reachable from a request. | Low | Fixed in `package-lock.json`; `npm audit` reports none. |
| 7 | CI used actions by movable tag and left the checkout token in `.git/config` while dependency install scripts and tests ran. | Low | Fixed: pinned to commit SHAs, `persist-credentials: false`. |

### Checked and sound

- **No XSS sinks.** The only `dangerouslySetInnerHTML` is the static theme
  script in `app/layout.tsx`, built from constants. Advisory and alert text is
  rendered as React text, and advisory links are kept only if they are
  `http:` or `https:` (`webLink` in `components/ServiceStatus.tsx`). External
  links use `rel="noreferrer"`.
- **No SSRF.** Every upstream URL is a constant. Request input only becomes a
  form field or a lookup key, and each route validates it first: station codes
  against the station list, train numbers against `/^\d{1,4}$/`, Subway
  stations and routes against MTA metadata.
- **No secrets in responses or logs.** Error responses are generic. Upstream
  error bodies are logged (truncated) but never returned. The rejected token
  on `InvalidTokenError` is non-enumerable, so logging the error leaves it
  out. A scan of the tree and its git history found no committed credentials.
- **Redis keys are fixed.** Request input never becomes a Redis key or a Lua
  argument.
- **The token's 10 a day** is guarded by an Upstash lock and a shared cooldown
  (`lib/njtTokenStore.ts`). A visitor cannot force a mint: only NJ Transit
  rejecting the token starts one.
- **The service worker** caches same-origin GETs only.

## Protections in code

- **NJ Transit call budget** (`lib/njtCallBudget.ts`). Each app instance may
  make 40 RailData data calls at once and 20 a minute sustained. Beyond that,
  a request that misses the cache gets a 503 with `Retry-After` and
  `kind: "upstream"`, so the page offers to try again. Fixture mode and the
  collector are not counted. The budget is per instance: it limits the damage
  but cannot prevent it, because a flood that spreads across many instances
  gets each one's allowance. The platform rate limit below is what stops it.
- **Single-flight caches** in `lib/departureBoard.ts` and
  `app/api/stops/[train]/route.ts`.
- **Input bounds** on every API route.
- **Headers** (`next.config.ts`): CSP, HSTS, `Permissions-Policy` (location
  for this site only, for nearby stations), COOP, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`.

  Inline scripts remain allowed. A nonce would block them, but nonces need
  every page rendered per request, which gives up the prerendering Cache
  Components provides. Next's experimental Subresource Integrity support
  (`experimental.sri`) is the path to removing `'unsafe-inline'` later.

## Settings outside this repository

These are not in the code, and some matter more than anything above. They
were not checked in this review because they live in Vercel, Cloudflare,
Upstash and GitHub.

### Vercel (the app)

- **Add a rate limit on `/api/`** under Firewall → Rules: for example, 60
  requests a minute per IP, answered with 429. A rider polls each board about
  twice a minute, so normal use stays well under this. This rule is what
  prevents finding 1; the in-code budget only limits it.
- Keep **Attack Challenge Mode** in mind for an active flood.
- **Deployment Protection** on preview deployments: if previews have the
  production NJ Transit and Upstash credentials, a public preview URL is another way
  to spend the same quota.
- Keep production and preview credentials in Vercel's **sensitive**
  environment variables, so they cannot be read back from the dashboard.
- The CSP blocks the Vercel Toolbar's scripts, which come from
  `vercel.live`. If you use the Toolbar on previews, allow that origin for
  preview builds only (`VERCEL_ENV=preview`).

### Upstash

- The app and the collector share one REST token with full access. Upstash's
  ACL can issue each its own credential, limited to the commands and
  `departure-board:*` keys it uses, so that a leak of either can be revoked
  without the other.
- Rotate the token if it was ever pasted into a terminal, chat or issue.

### Cloudflare (the collector)

- Keep `workers_dev = false` and `preview_urls = false` (set in
  `collector/wrangler.toml`), so the Worker never gets a public URL.
- Workers Builds deploys every push to `main`. Use a Cloudflare API token
  scoped to this Worker, and require two-factor authentication on the account.

### GitHub

- Both Vercel and Cloudflare deploy `main` automatically, so whoever can push
  to `main` controls production. Protect it with a ruleset: pull requests
  only, the CI check required, no force pushes.
- Turn on **secret scanning with push protection**, Dependabot alerts and
  Dependabot security updates. `.github/dependabot.yml` opens security
  updates only; they also cover the SHA-pinned actions in CI.
- Require two-factor authentication on accounts with write access.

### NJ Transit

- If the RailData password was ever shared or committed elsewhere, change it
  on the developer portal and update Vercel and Cloudflare together.
