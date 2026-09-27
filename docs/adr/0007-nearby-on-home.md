---
status: accepted
---

# Put Nearby back on Home, and leave location memory to the browser

Nearby moved to its own page (#57) so Home would never ask for location. In
practice riders almost always open a favorite or a station near them, and
rarely type a name, so Home made the common case two steps away and the
uncommon one (search) the most prominent.

## Decision

- Home lists **Favorites**, then **Nearby** (closest five, then "Show more").
  A favorite that is also nearby appears only under Favorites, with its
  distance. The `/nearby` route is removed.
- Search is collapsed behind a magnifier in Home's header. Opening it renders
  and focuses the box within the tap, since iOS only raises the keyboard for a
  focus made during the gesture.
- Home looks up location without asking only when
  `navigator.permissions.query({ name: "geolocation" })` reports `granted`.
  Every other answer, or no Permissions API, shows the section grayed out
  with an **Enable location** button; tapping it calls `getCurrentPosition`
  and the browser decides whether to prompt.
- A refusal leaves the section grayed out with the same button. A failure
  that is not a refusal (no fix, a timeout) offers **Try again**.
- The app stores nothing about location. Hiding Nearby entirely is a
  Settings choice (`departure-board:show-nearby`), not something a
  permission response can do, and Home does not advertise it.
- Every page but Home uses the shared card header with the Home button; About
  data now does too.

## Considered and rejected

- **Telling "denied" from "blocked by a setting" by how fast the error
  arrives.** Not a documented or common technique, and fragile across devices
  and browser versions.
- **Per-browser instructions** (iOS Safari, Chrome, macOS paths). User-agent
  sniffing is unreliable and settings paths change with OS releases.
- **Remembering an opt-in and prompting on every visit.** Safari reports
  `prompt` even for a denied site, so the app could not tell when it was
  nagging. On iOS Safari a rider who wants no prompt sets the site to Allow in
  Website Settings; the browser then reports `granted` and Home fills in
  unasked.
