# Mobile navigation brief (2026)

_Research date: 2026-08-09. Sources are first-party web guidance from W3C/WAI,
MDN, web.dev, and Apple. “Inference” marks a recommendation
for this repository rather than a direct rule from a source._

## Short recommendation

**Use a compact, persistent breadcrumb trail for orientation; do not make a
drawer or radial menu the primary answer.** The repository’s hierarchy is
roughly:

`Station picker → Interchange → one system’s departure board → train or direction detail`

_Inference_: show the relevant portion of that hierarchy in the board header,
with links for parent pages and the current page clearly marked. Keep Settings
as a secondary action. If navigation later grows to several unrelated
top-level destinations, add a conventional modal navigation drawer. Do not use
a pie/radial menu as the only way to reach a destination.

This separates two jobs: breadcrumbs answer “where am I?”, while navigation
answers “where can I go?”. A breadcrumb trail should not replace the Station
picker.

## Shared UI vocabulary

- **Breadcrumb trail**: an ordered sequence of links to parent pages, ending at
  the current page.
- **Navigation drawer**: a panel containing navigation destinations that opens
  from an edge. A **modal drawer** blocks the page behind it while open.
- **Popover**: a small temporary panel anchored to a control; it is not
  automatically a modal or a navigation drawer.
- **Radial menu / pie menu**: a menu whose choices are arranged around a
  center, usually selected by direction or gesture.
- **Top-level destination**: a peer area of the product, such as the Station
  picker or Settings; a train row is content/detail, not top-level navigation.
- **Icon-only control**: a control whose visible label is an icon rather than
  text. An accessible name is still required.
- **Font weight**: `500` is medium, `600` is semibold, and `700` is bold.
  Say the number and the affected text when discussing emphasis; “make it
  bold” is otherwise ambiguous.

## Sourced guidance

### Breadcrumbs and hierarchy

WAI defines a breadcrumb trail as a list of links to parent pages “in
hierarchical order” that helps people find their place in a website or
application. The breadcrumb navigation landmark needs an accessible name, and
the current page is identified with `aria-current="page"` when appropriate.
See the [WAI-ARIA breadcrumb pattern](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/).

W3C’s breadcrumb technique says breadcrumbs can show either the path taken or
the current location in the site structure, and recommends placing them high on
the page, typically after the header. It also says breadcrumb techniques are
examples, not a requirement in themselves. See [WAI Technique G65](https://www.w3.org/WAI/WCAG22/Techniques/general/G65).

W3C does not publish a separate mobile WCAG; its [mobile accessibility guidance](https://www.w3.org/WAI/standards-guidelines/mobile/)
says existing accessibility standards apply across mobile devices and input
modalities. Therefore, a mobile breadcrumb still needs to reflow, remain
operable, and preserve its meaning when text is enlarged.

### Drawers, menus, and discoverability

_Inference_: a conventional web navigation drawer is a future scalability
option, not an obvious fit for the current two-destination product surface.

WAI recommends familiar, consistent placement and visible labels where
possible; menu items should adapt to larger text and zoom, have sufficient
spacing, and expose current/focus/active states without relying on color alone.
See [WAI menu styling](https://www.w3.org/WAI/tutorials/menus/styling/) and
[WAI menu structure](https://www.w3.org/WAI/tutorials/menus/structure/).

For ordinary site navigation, WAI’s disclosure pattern uses normal links and a
button with `aria-expanded`/`aria-controls`; it explicitly avoids the ARIA
`menu` role because typical navigation does not need the complex composite
widget behavior of an application menu. See the [WAI disclosure navigation
example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/).

If a mobile drawer is modal, WAI’s dialog pattern requires focus to move inside
it, remain inside while open, close with `Escape`, and return to the invoking
control when it closes. Content behind it is inert. See [WAI modal dialog
pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and MDN’s
guidance for [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

Apple’s current HIG similarly says menu labels should clearly and succinctly
describe what each item does, important items should appear first, and
submenus should be used sparingly because they hide choices. See [Apple HIG:
Menus](https://developer.apple.com/design/human-interface-guidelines/menus).

### Touch reachability and accessibility

WCAG 2.2 requires pointer targets to be at least **24 × 24 CSS pixels** at
Level AA, subject to exceptions; its enhanced Level AAA criterion uses **44 ×
44 CSS pixels**. The WAI explanation specifically calls out mobile users,
one-handed use, tremors, and use while a device is moving. See [WCAG 2.2
Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
and [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).

WAI also requires alternatives for functions that depend on dragging, and
mobile layouts must reflow without loss of information or functionality. See
[WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) and
[Dragging Movements](https://www.w3.org/TR/WCAG22/#dragging-movements).

### Responsive interaction and perceived speed

WAI’s mobile guidance emphasizes multiple input modalities, including touch,
speech, and other adaptive input. See [WAI mobile accessibility](https://www.w3.org/WAI/standards-guidelines/mobile/).
_Inference_: a navigation design therefore cannot depend on a swipe, a radial
direction, hover, or fine motor precision alone.

web.dev defines **Interaction to Next Paint (INP)** as the responsiveness of
interactions over the page lifetime; a good target is 200 ms or less at the
75th percentile, segmented by mobile and desktop. Its examples explicitly use
opening a mobile navigation menu: the first visual state should appear quickly,
even if later work continues. See [web.dev INP](https://web.dev/articles/inp)
and [Optimize INP](https://web.dev/articles/optimize-inp).

web.dev describes **LCP** as a perceived-load signal because it indicates when
the main content is likely visible, and describes the browser back/forward cache
as enabling near-instant return navigation without a network request. See
[LCP](https://web.dev/articles/lcp) and [back/forward cache](https://web.dev/articles/bfcache).

## Inferences for this app

1. **Breadcrumbs are the best fit for the user’s stated desire.** The current
   model has a real hierarchy, and the board header already contains a station
   title. A compact trail can make that hierarchy visible without covering live
   departures or adding a new menu state. On narrow screens, allow wrapping or
   a deliberately designed compact representation; do not silently remove the
   current location.
2. **A drawer is a future scalability option, not a present simplification.**
   With Station picker and Settings as the main destinations, a drawer adds an
   invocation step and hides both choices. If the surface expands, use a
   conventional modal drawer with text labels, a scrim, large rows, focus
   management, and immediate open/close feedback.
3. **A pie menu should be rejected as primary navigation.** No reviewed W3C,
   MDN, web.dev, or Apple source recommends radial menus for
   web navigation. _Inference_: radial sectors are a poor default for this app
   because they make labels, reading order, keyboard navigation, speech input,
   localization, and discoverability harder than a linear list. It could only
   be considered as an optional shortcut after conventional links work.
4. **Optimize the action path, not just the animation.** Navigation should be
   local and synchronous where possible: show the selected state in the next
   paint, avoid waiting for a data request before opening a menu or returning to
   a board, preserve browser back/forward behavior, and keep live departure
   data as the visual priority. Measure mobile interaction latency rather than
   assuming a fast animation feels fast.
5. **Use explicit design-language terms in implementation discussion.** For
   example: “use a `600` semibold label for the current breadcrumb item” is
   testable; “make the header bold” is not.

## Decision to prototype

Prototype a **persistent breadcrumb trail plus a simple secondary Settings
control** first. Compare it against a conventional **modal drawer** only if the
hierarchy becomes too long or the number of top-level destinations grows. Keep
the board’s first departure and freshness/status context visually dominant.
