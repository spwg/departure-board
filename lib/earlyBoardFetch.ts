/**
 * Starts a board's first departures request while the page's JavaScript is
 * still loading, instead of after React hydrates — on a phone that is most of
 * a second sooner. instrumentation-client.ts calls `startEarlyBoardFetch` when
 * a station page is opened directly; the board takes the response on its
 * first load. In-app navigations do not need it: the board mounts as soon as
 * the route renders.
 *
 * The paths must match what the boards request (components/DepartureBoard,
 * and components/SubwayBoard as components/TransferBoard configures it). A
 * mismatch only costs the early request; the board then fetches as before.
 */

const BOARD_PAGES: [RegExp, (id: string) => string][] = [
  // The page accepts any case; its board asks for the canonical uppercase code.
  [/^\/station\/([A-Za-z0-9]+)$/, (code) => `/api/departures/${code.toUpperCase()}`],
  [/^\/subway\/station\/([A-Za-z0-9]+)$/, (id) => `/api/subway/departures/${id}?exact=true`],
];

let early: { path: string; response: Promise<Response> } | null = null;

/** Requests the departures for the board page at `pathname`, if it is one. */
export function startEarlyBoardFetch(pathname: string): void {
  for (const [page, apiPath] of BOARD_PAGES) {
    const match = page.exec(pathname);
    if (!match) continue;
    const path = apiPath(match[1]!);
    const response = fetch(path, { cache: "no-store" });
    // A failure surfaces to the board that takes it; one nobody takes is moot.
    response.catch(() => {});
    early = { path, response };
    return;
  }
}

/** The early response for `path`, handed out once; null if none was started for it. */
export function takeEarlyBoardFetch(path: string): Promise<Response> | null {
  if (early?.path !== path) return null;
  const { response } = early;
  early = null;
  return response;
}
