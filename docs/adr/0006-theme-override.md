---
status: accepted
---

# Let riders override the OS colour theme

The board has always had light and dark palettes, chosen by the OS through
`prefers-color-scheme`. Riders had no way to use dark on a light-mode phone, or
the reverse — for example, a dark board on a bright platform at night while
the phone stays light.

## Decision

- Settings gains an **Appearance** choice: System / Light / Dark. System is the
  default, so a rider who never opens Settings sees no change, and there is
  always a way back to following the OS.
- The choice is stored in `localStorage` (`departure-board:theme`), like the
  clock format. It is not stored in a cookie, because reading a cookie on the
  server would make every page dynamic and weaken the static and offline
  service-worker copies.
- An inline script in `<head>` sets `data-theme` on `<html>` while the HTML
  is still being parsed, before first paint, so a forced theme never flashes
  the OS one first. `globals.css` applies the dark palette when the OS is dark
  and the rider has not forced light, or when dark is forced.
- While a theme is forced, a `theme-color` meta tag is prepended to `<head>`
  so the browser chrome and iOS status bar match the page, not the OS.
- Components use semantic colour tokens (`accent`, `ok`, `warn`, …), never
  Tailwind's `dark:` variant, which follows only the OS and would ignore the
  override.
- Agency colours (NJT lines, Subway bullets) and the web-app manifest colours
  stay the same in both themes.
