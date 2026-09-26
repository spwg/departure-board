---
status: accepted
---

# Show New York Penn sighted tracks, learned from signal circuits

NJ TRANSIT posts New York Penn tracks late, often after the train has been
standing on its platform for a while. RailData's `getVehicleData` reports each
active train's signal track circuit (`ICS_TRACK_CKT`) by train number, so a
train already on a platform can be placed before its track is posted. This is
the "train is already sitting at a platform" signal pennstation.fyi reports as
99.6% accurate and typically about 15 minutes ahead of the boards.

## Decision

- The New York Penn board shows a **sighted track** for an unposted, running
  train whose circuit is a known platform circuit. Posted tracks always win.
- Circuit names are not documented, so the circuit-to-platform mapping is
  learned rather than hand-written. Whenever the NY board refreshes, each train
  with a posted track that reports a circuit adds one count to that
  circuit/track pair in Upstash Redis (once per train per day). A circuit names
  a platform only after at least 5 counts, 95% of them for one track; approach
  circuits, which see several tracks, never qualify.
- Sightings are best-effort: any vehicle-data or Redis failure leaves the board
  exactly as NJ TRANSIT sent it.

## Rejected

- **History-based track guesses** (pennstation.fyi's "Likely · N%"). Its author
  reports 23.6% accuracy across 2,810 guesses — not something a rider should
  walk toward, and it would blur the line between what is known and what is
  hoped.
- **Treating the posted `TRACK` field as early.** It is the same value the boards
  show; the board already displays it the moment NJ TRANSIT publishes it.

## Consequences

- Sightings appear only after the table has learned each platform circuit, which
  takes a few days of NY board traffic. Until then the board behaves as before.
- One extra `getVehicleData` call per NY board refresh (shared by the 20-second
  server cache), well within RailData's 40,000 daily calls.
