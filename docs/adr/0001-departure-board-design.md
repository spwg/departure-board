# Departure board design is governed by the rider's job, not by feature parity

The rail and subway boards drifted into two different products — different row
anatomy, grouping, density, and information hierarchy — even though no user
story asked for that. Every individual defect turned out to be a story
satisfied literally and in isolation, with nobody accountable for the
composition. This ADR records the rules the boards now answer to, so that
future stories compose instead of accreting.

## The two jobs

A **rail** rider targets one particular train: they know they want the 12:56 to
Long Branch. A **subway** rider takes whichever train comes next. Every rule
below derives from that difference, and disagreements about a board should be
settled by asking which job the content serves.

## Rules

1. **Consistency, not uniformity.** Every element appearing on both boards is
   identical. Neither board reserves space for a concept it does not have —
   subway has no track assignment, so it renders no track slot, empty or
   repurposed. A slot in a fixed position must mean one thing everywhere or it
   should not be shared; a shared position with two meanings is a false friend.
2. **A board fills a slot only when its content answers that board's job.**
   This is why subway shows no clock time and rail does.
3. **Copy rider behavior, not sign hardware.** NJ TRANSIT's flat concourse board
   reflects how rail riders scan for their train, so our rail board is flat. The
   MTA's two-row rotating platform sign reflects the size of an LED panel, not a
   rider limit, so we do not imitate its depth or its carousel.
4. **Chrome yields before facts.** When width is scarce, controls shrink or go
   before the destination or next stop is truncated.
5. **Nothing sits above the first departure** except the single service-status
   line and, when stale, the freshness warning.

## What the rules produce

**Rail** — one chronological list of every departure, as the station's own board
shows it. Countdown (to *expected*) and clock (to *scheduled*) both stay: they
carry different facts, and their divergence is how a delay is visible at all.

**Subway** — departures grouped by MTA's station-direction labels, standing in
for the platform the rider has not yet chosen. Every train in every group is
shown, with sticky headers; there is no cap and no "view all" step. The row
carries route bullet, destination, **next stop**, and countdown. No clock: the
subway feed's expected time was being rendered twice, once as a countdown and
once as a clock, which is the only true duplication we found.

## Rejected alternatives

- **A `Local` / `Express` label.** Not reliably derivable. The realtime feed
  carries no service-type flag; deriving it from stop patterns needs a static
  trunk table, leaves ~31% of live trips unclassifiable (their remaining stop
  list is too short), and — decisively — express-ness is a property of a train
  *relative to where the rider is standing*. A `2` out of Penn runs express
  through Manhattan and local in the Bronx. **Next stop** delivers the same
  signal exactly, from data that is always present, in the rider's own words.
- **Naming skipped stops** (`skips 66, 79, 86 St`). Correct and derivable, but
  next stop is the cue riders actually use when boarding, and it matches the
  sign inside the train.
- **Severity-gated alerts** — showing serious notices and collapsing the rest.
  NJ TRANSIT's feed marks `advisoryAlert=0` for *current* notices, which covers
  both a full suspension and one train running 15 minutes late. The feed marks
  currency, not consequence, so the rule was not implementable. Building it on
  MTA's richer GTFS-RT `effect` enum alone would make the two boards collapse
  alerts by invisible, differing logic.
- **Uniform rows across systems**, achieved by reserving always-empty slots or
  by repurposing a slot per system. Rejected under rule 1.
- **Capping a direction group by time window** rather than count. Adapts to
  headway, but shows *zero* trains during a 35-minute late-night gap, which is
  when the board matters most.

## Consequences

- NJ TRANSIT direction grouping is retired, and with it `lib/njtSchedule.ts`,
  `directionGroups`, the `direction` field, and the daily schedule fetch with
  its cache and backoff. That removes an upstream RailData call and its quota
  cost. Reversing this is cheap only while nothing else consumes the data.
- Rule 5 binds any future alert work, including MTA service status, before it
  is written rather than after.

## Scope

These rules govern the **board**. They are not a general theory of what rail and
subway riders want, and they should not be used to justify divergence elsewhere
in the product. The two-jobs principle was misapplied once already, to argue
that subway trains should not be watchable — a 35-minute late-night headway
makes a subway rider target a train exactly as a rail rider does.
