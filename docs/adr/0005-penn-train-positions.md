---
status: accepted, partly superseded by 0008
---

# Show New York Penn train positions and keep their track history

_The on-platform threshold, the history page, the raw position line and the
GitHub Actions schedule below are superseded by ADR 0008._

NJ TRANSIT posts New York Penn tracks late, often after the train has been
standing on its platform for a while. RailData's `getVehicleData` reports each
active train's signal track circuit (`ICS_TRACK_CKT`) and coordinates by train
number, so a train already on a platform can be seen before its track is
posted. This is the "train is already sitting at a platform" signal
pennstation.fyi reports as 99.6% accurate and typically about 15 minutes ahead
of the boards.

## Decision

- The New York Penn board shows each unposted, running train's **train
  position** straight from the vehicle feed: its signal circuit, marked "At
  Penn" when its coordinates fall inside the station. It needs no history and
  is worded as a place, never as a track. Posted tracks always win.
- Every pairing of a circuit with a posted track is kept as **position
  history** in Upstash Redis — pair counts plus a capped list of individual
  pairings, each recorded once per train per day. A circuit whose history has
  at least 3 pairings, 95% of them one track, is also shown as that platform
  ("on platform"), outlined rather than solid.
- History must not depend on anyone viewing the board, since the app may have a
  single rider. A scheduled GitHub Actions workflow calls
  `/api/penn-positions/record` (guarded by `CRON_SECRET`) every five minutes,
  which loads the NY board and records any new pairings. Board views record too.
- The history is readable on `/train/[id]/positions`, linked from every train
  page's header.
- Each layer is best-effort: without Redis the raw position still shows, and
  without the vehicle feed the board is exactly what NJ TRANSIT sent.

## Rejected

- **History-based track guesses** (pennstation.fyi's "Likely · N%"). Its author
  reports 23.6% accuracy across 2,810 guesses — not something a rider should
  walk toward.
- **Treating the posted `TRACK` field as early.** It is the same value the boards
  show; the board already displays it the moment NJ TRANSIT publishes it.
- **Vercel Cron.** Hobby projects allow only daily jobs, and a more frequent
  schedule fails the deployment.

## Consequences

- Circuit names are shown raw; RailData does not document them.
- The schedule costs two RailData calls every five minutes (about 600 a day),
  well within the 40,000 daily limit. GitHub may delay scheduled runs and pauses
  them after 60 days without repository activity.
