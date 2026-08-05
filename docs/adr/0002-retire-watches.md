# Watches are retired

Watches let a rider subscribe to exact upcoming trains across stations and get
alerted on material changes. They shipped, they work, and they are being
removed: the product's primary user does not use them, and no mechanism exists
by which that would ever be contradicted.

## Why now

The codebase carries **no analytics of any kind** — no gtag, no plausible, no
posthog. So "I don't know of anyone else using watches" is not a gap that can be
closed by waiting. The choice was never between deciding now and deciding later
with data; it was between deciding now and deciding never. Instrumenting a
departure board to settle it would cost more, in complexity and in rider
privacy, than the feature is worth.

Against that: ~530 lines across five modules and two test files, a background
polling loop, 19 of the 38 user stories in the "contextual live departure
monitoring" spec, and a backlog ticket for extending watches to subway. Watches
also distorted board design — the question of what a row owed the Watch button
came up repeatedly while settling
[0001](./0001-departure-board-design.md), and once produced a
system-specific rule that was simply wrong.

## What this is not

Not a judgment that cross-station watching is a bad idea. It is the only part of
this product that goes beyond being a good departure board, and "the person who
built it never formed the habit" is weak evidence about anyone else. It is a
judgment that a personal-scale project should not maintain a feature and half a
spec on speculation.

## Reversing this

The implementation is intact in history at `62facc9` and can be restored. What
would justify restoring it: a second regular user asking for it, or the author
finding themselves repeatedly reloading a board to track one train — the
original problem watches were built to solve.

## Consequences

- `lib/watches.ts`, `lib/watchMonitor.ts`, `components/WatchButton.tsx`,
  `components/WatchedDepartures.tsx`, `components/WatchMonitor.tsx` and their
  tests are deleted; rail departure rows lose their trailing control and become
  a single tap target, which is what their own code comment always intended.
- The browser-notification permission prompt leaves the product entirely.
- The watch stories live in a **closed** spec issue, which is a record of what
  shipped rather than a statement of intent. Its body is left intact and a
  comment records the supersession, so the original reasoning survives verbatim
  for anyone who revisits this.
