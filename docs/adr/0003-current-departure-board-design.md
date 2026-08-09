---
status: accepted
---

# The implemented departure boards are the canonical design

ADR-0001 described the design that preceded the board work merged through PR #55,
but its uncapped Subway-board rule now contradicts the shipped product.
This ADR supersedes ADR-0001 and records the code and tests at `ac7746e` as the
canonical resolution of that conflict. The implementation remains free to
evolve through later decisions; “canonical” here resolves the existing
documentation conflict rather than making every incidental code detail an
architectural rule.

## Current board design

- A Rail departure board is one chronological list. Each row keeps the
  destination, line and train number, countdown to expected departure, clock
  time, and track together; delayed trains expose both scheduled and expected
  clock times. Airport service is always identified when present, while “via
  Secaucus” appears only when it distinguishes otherwise matching
  destinations.
- A Subway departure board is a scannable overview, not the complete result
  set. It shows at most two direction groups and the next three trains in each.
  A group with more trains links to a dedicated direction page containing the
  full chronological list for that direction. Direction labels remain MTA
  wayfinding labels when available, and each row shows route, destination,
  next stop, and countdown without a redundant clock time.
- Departure rows on both systems open the exact train's remaining route.
  Destination filters are not part of either board.
- An Interchange presents one system's board at a time and preserves a live
  originating-train cutoff when the rider switches systems or opens a full
  Subway direction page. The product filters departures to those after that
  cutoff but does not claim which transfers are catchable.
- Service status and freshness remain board-level context. They do not merge
  the two systems' data or replace departures with a combined operations list.

## Why this supersedes the earlier rule

Showing every Subway train directly on the station board made the primary view
long and difficult to scan. The overview/detail split preserves immediate
comparison of the next useful options while keeping all later departures one
tap away. It also gives multi-direction stations a bounded primary board and
lets transfer cutoffs continue updating on the direction page. This explicitly
reverses ADR-0001's rule that Subway direction groups are uncapped and have no
“view all” step; the Rail list and the remaining rider-job distinctions survive
because the current implementation still embodies them.
