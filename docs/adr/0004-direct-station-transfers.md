---
status: accepted
---

# Transfers navigate directly between station boards

Transfers are direct links from one provider-owned station board to another.
The destination is an ordinary station route, and its board remains separate
and live. There is no additional hub page or combined departure feed in the
navigation hierarchy.

## Why

The rider's mental model is a station with nearby transfer choices, not a
separate navigation object between the station and its boards. Direct station
routes keep breadcrumbs honest:

`Stations → station → service departures → direction detail`

The same model handles cross-provider and same-provider transfers, including
NJT to 1/2/3 at Penn, A/C/E to 1/2/3 at Penn, A/C/E to L at 14 St, and A/C/B/D
to 1 at Columbus Circle.

## Consequences

- The station picker lists each provider-owned board directly.
- Transfer configuration stores directed station-to-station links.
- Destination boards remain independent provider-owned views.
- Rail and Subway boards remain separate provider-owned feeds.
- Breadcrumbs contain station pages and board details only; transfer links are
  actions between peer station destinations rather than breadcrumb levels.
