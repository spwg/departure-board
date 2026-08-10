---
status: accepted
---

# Interchanges model explicit transfer nodes

An Interchange is a transfer hub connecting provider-owned boarding locations,
not a page that switches between one view per transit system. Each boardable
station or line group is a **Transfer node**, and each permitted origin-to-
target relationship is an explicit directed **Transfer option**. The
Interchange landing page chooses a node; the selected provider board remains
independent and live data is never merged.

## Why

The former `InterchangeView` model made the transit system the only possible
target. It could not represent same-system transfers such as A/C/E to 1/2/3 at
Penn or A/C/E to L at 14 St, and it calculated the originating arrival against
the whole hub instead of the exact boarding location. Explicit nodes preserve
provider-native station identities while making the rider's actual transfer
choices visible. Static hub configuration also keeps the chooser fast: only the
selected node loads live departures.

## Consequences

- Reciprocal connections are stored as two options, allowing future hubs to
  describe one-way or asymmetric relationships.
- A transfer context carries the exact origin node and train identity, so a
  target board filters after the correct live arrival.
- Rail and Subway boards remain separate provider-owned feeds; this decision
  does not create a trip planner or claim that a connection is catchable.
- Future providers such as LIRR can add a Transfer node and board adapter
  without changing the Interchange shape.
- This supersedes the Interchange rule in ADR-0003; its rail/subway board
  distinctions and service-status rules remain in force.
