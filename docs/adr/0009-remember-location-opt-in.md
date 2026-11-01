---
status: accepted
---

# Remember the rider's location opt-in

Amends ADR-0007's browser-only location memory. Returning riders repeatedly
see Enable location when the browser reports prompt or cannot expose its
permission state, even after they have chosen to use Nearby.

Remember the choice in localStorage with no application expiry, both when a
rider taps Enable location and when existing browser permission permits an
automatic lookup. On later visits, request location automatically for that
choice even when permission is prompt or unreadable. A browser-reported denial
or permission-denied callback clears the choice, preventing repeated requests
after a refusal. Timeouts and unavailable fixes preserve the choice for the
next visit. Hiding Nearby still prevents automatic location requests.

The browser controls actual permission persistence and may still prompt. The
site cannot grant itself permanent permission. Storage failure must not stop
an explicit request from working. No coordinate history is stored by the app;
getCurrentPosition may reuse the browser's cached fix for five minutes, after
which it must retrieve a fresh one rather than show stations near an old fix.
