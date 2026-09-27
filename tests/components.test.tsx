import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageTitle } from "@/components/PageTitle";
import { FavoriteButton } from "@/components/FavoriteButton";
import { NearbyStations } from "@/components/NearbyStations";
import { SettingsButton } from "@/components/SettingsButton";
import { StationTransferLinks } from "@/components/StationTransferLinks";
import { SubwayRouteIcons } from "@/components/SubwayRouteIcons";
import { TransferLinks } from "@/components/TransferLinks";
import { DepartureBoard } from "@/components/DepartureBoard";
import { DepartureRow } from "@/components/DepartureRow";
import { RetiredWatchStateCleanup } from "@/components/RetiredWatchStateCleanup";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { SettingsPage } from "@/components/SettingsPage";
import { StationPicker } from "@/components/StationPicker";
import { StopList } from "@/components/StopList";
import { SubwayBoard } from "@/components/SubwayBoard";
import { SubwayStopList } from "@/components/SubwayStopList";
import { SubwayTrainProvider, SubwayTrainTitle } from "@/components/SubwayTrainHeader";
import { njtBoardChoice } from "@/lib/boardChoices";
import type { Departure } from "@/lib/departures";
import type { StopList as StopListData } from "@/lib/stops";

const departure: Departure = { id: "1", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:05:00.000Z", trainNumber: "1234", line: "Northeast Corridor Line", lineCode: "NE", track: "5", status: "delayed", statusText: "5 Min Late", delayMinutes: 5 };
const stopList: StopListData = { trainNumber: "1234", lineCode: "NE", destination: "Trenton", transferAt: "", stops: [{ code: "NY", name: "New York Penn Station", time: "2024-05-30T15:00:00.000Z", departed: false, pickupOnly: false, dropoffOnly: false }] };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(navigator, "geolocation");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("interactive component contract", () => {
  it("renders a live Subway board with simultaneous official directions and provider-native rows", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures: [
        { id: "mta:a:127", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", nextStop: "Times Sq-42 St", expectedTime: "2026-08-04T12:05:00.000Z" },
        { id: "mta:b:127", route: "2", direction: "Downtown", destination: "Flatbush Av-Brooklyn College", nextStop: "14 St", expectedTime: "2026-08-04T12:07:00.000Z" },
      ],
    })))));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    render(<SubwayBoard stationId="127" />);
    expect(await screen.findByRole("heading", { name: "Uptown" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Downtown" })).toBeTruthy();
    expect(screen.getByLabelText("1 train")).toBeTruthy();
    expect(screen.getAllByText("Van Cortlandt Park-242 St")).toHaveLength(1);
    expect(screen.getByText("5 min")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /filter destinations/i })).toBeNull();

    // Every row carries its destination and countdown, and nothing else: no
    // ambiguous next stop, no clock time beside the countdown, and no
    // direction restating the heading above it.
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).queryByText("Next stop")).toBeNull();
      expect(row.textContent).not.toMatch(/Times Sq-42 St|14 St/);
      expect(row.textContent).not.toMatch(/\d:\d\d/);
      expect(row.textContent).not.toMatch(/Uptown|Downtown/);
    }
  });

  it("caps each direction at three trains and links to its full direction page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    const minutes = [1, 2, 3, 4, 5, 6];
    const departures = [
      ...minutes.map((minute) => ({ id: `up-${minute}`, route: "1", direction: "Uptown", destination: `Uptown destination ${minute}`, nextStop: "Times Sq-42 St", expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
      ...minutes.map((minute) => ({ id: `down-${minute}`, route: "2", direction: "Downtown", destination: `Downtown destination ${minute}`, nextStop: "14 St", expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
      ...minutes.map((minute) => ({ id: `side-${minute}`, route: "7", direction: "Queens", destination: `Queens destination ${minute}`, nextStop: "Grand Central-42 St", expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
    ];
    // The board arrives chronologically; grouping must not reorder within a group.
    departures.sort((a, b) => a.expectedTime.localeCompare(b.expectedTime));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures,
    })))));

    // A direction-focus parameter left in an old bookmark does not affect the
    // main board; direction pages now have their own route.
    window.history.replaceState(null, "", "/subway/station/127?direction=Uptown");
    render(<SubwayBoard stationId="127" />);

    const uptown = (await screen.findByRole("heading", { name: "Uptown" })).closest("section")!;
    const downtown = screen.getByRole("heading", { name: "Downtown" }).closest("section")!;
    expect(within(uptown).getAllByRole("listitem")).toHaveLength(3);
    expect(within(downtown).getAllByRole("listitem")).toHaveLength(3);
    expect(within(uptown).getAllByRole("listitem").map((row) => row.textContent)).toEqual(
      minutes.slice(0, 3).map((minute) => expect.stringContaining(`Uptown destination ${minute}`)),
    );

    expect(screen.getByRole("link", { name: "Show more Uptown trains" }).getAttribute("href"))
      .toBe("/subway/station/127/Uptown");
    expect(screen.getByRole("link", { name: "Show more Downtown trains" }).getAttribute("href"))
      .toBe("/subway/station/127/Downtown");
    expect(screen.queryByText("Uptown destination 4")).toBeNull();
    expect(screen.queryByText("Downtown destination 4")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Queens" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    for (const heading of screen.getAllByRole("heading", { level: 2 })) {
      expect(heading.className).toContain("sticky");
    }

    cleanup();
    render(<SubwayBoard stationId="127" direction="Uptown" limit={null} />);
    const fullUptown = (await screen.findByRole("heading", { name: "Uptown" })).closest("section")!;
    expect(within(fullUptown).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByRole("link", { name: /Show more/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Downtown" })).toBeNull();
  });

  it("opens an exact Subway train's remaining live route from its row", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures: [{ id: "mta:numbered:064150_1..N03R:127", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", nextStop: "Times Sq-42 St", expectedTime: "2026-08-04T12:05:00.000Z" }],
    })))));

    render(<SubwayBoard stationId="127" />);

    const row = await screen.findByRole("link", { name: /Van Cortlandt Park-242 St/ });
    expect(row.getAttribute("href")).toBe(`/subway/train/${encodeURIComponent("mta:numbered:064150_1..N03R:127")}`);
  });

  it("shows a Subway train's remaining stops without a count header, and keeps them through a later failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error("offline"));
      if (calls === 4) return Promise.resolve(new Response(JSON.stringify({ error: "gone" }), { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify({
        id: "mta:numbered:trip:127", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St",
        stops: [
          { id: "127", name: "Times Sq-42 St", time: "2026-08-04T12:01:00.000Z" },
          { id: "125", name: "59 St-Columbus Circle", time: "2026-08-04T12:06:00.000Z" },
          { id: "101", name: "Van Cortlandt Park-242 St", time: null },
        ],
        sourceTimestamp: "2026-08-04T12:00:00.000Z",
      })));
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SubwayTrainProvider>
        <SubwayTrainTitle />
        <SubwayStopList tripId="mta:numbered:trip:127" />
      </SubwayTrainProvider>,
    );

    expect(await screen.findByText("Couldn't load this train.")).toBeTruthy();
    // A trip that never loaded still leaves the page a plain name.
    expect(screen.getByRole("heading", { name: "Subway train" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    // The route's own identity, in MTA's terms; the internal trip id is never
    // rider-facing text.
    expect(await screen.findByLabelText("1 train")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Van Cortlandt Park-242 St" })).toBeTruthy();
    expect(screen.getByText("Uptown")).toBeTruthy();
    expect(document.body.textContent).not.toContain("mta:numbered:trip:127");

    const stops = within(screen.getByRole("list", { name: "Remaining stops" })).getAllByRole("listitem");
    expect(stops.map((stop) => stop.textContent)).toEqual([
      expect.stringContaining("Times Sq-42 St"),
      expect.stringContaining("59 St-Columbus Circle"),
      expect.stringContaining("Van Cortlandt Park-242 St"),
    ]);
    expect(document.body.textContent).not.toMatch(/stops? remaining/);
    expect(document.body.textContent).not.toMatch(/Underway|hiding \d+ stops/);
    expect(within(stops[2]!).getByLabelText("No estimate yet")).toBeTruthy();

    // A later failure keeps the route on screen and dates it.
    vi.setSystemTime("2026-08-04T12:03:00.000Z");
    fireEvent(document, new Event("visibilitychange"));
    expect((await screen.findByRole("status")).textContent).toContain("last updated 3 minutes ago");
    expect(screen.getByText("59 St-Columbus Circle")).toBeTruthy();
  });

  it("says plainly when a Subway train has finished its run", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "gone" }), { status: 404 }))));

    render(<SubwayStopList tripId="mta:numbered:finished:127" />);

    expect(await screen.findByText(/no longer running/i)).toBeTruthy();
  });

  it("retries an initial Subway failure and retains the last source-dated board after a later failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      calls += 1;
      if (calls === 1 || calls === 3) return Promise.reject(new Error("offline"));
      return Promise.resolve(new Response(JSON.stringify({
        station: { id: "127", name: "34 St-Penn Station" },
        sourceTimestamp: "2026-08-04T12:00:00.000Z",
        departures: [{ id: "mta:a:127", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", nextStop: "Times Sq-42 St", expectedTime: "2026-08-04T12:05:00.000Z" }],
      })));
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SubwayBoard stationId="127" />);
    expect(await screen.findByText("Couldn't load departures.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Van Cortlandt Park-242 St")).toBeTruthy();
    vi.setSystemTime("2026-08-04T12:02:00.000Z");
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await screen.findByRole("status")).textContent).toContain("last updated 2 minutes ago");
    expect(screen.getByText("Van Cortlandt Park-242 St")).toBeTruthy();
  });

  it("persists favourite choices and exposes the action through accessible state", async () => {
    render(<FavoriteButton choice={njtBoardChoice("NY")} name="New York Penn Station" />);
    const button = screen.getByRole("button", { name: /add new york/i });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));
    expect(JSON.parse(window.localStorage.getItem("departure-board:favorites")!)).toEqual(["njt:NY"]);
  });

  it("lets riders explicitly select 24-hour time on the Settings page", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    const button = screen.getByRole("radio", { name: /24-hour/i });
    expect(button.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-checked")).toBe("true");
    expect(button.textContent).toContain("19:05");
    expect(window.localStorage.getItem("departure-board:use-24-hour-time")).toBe("true");
  });

  it("links the home settings control to the Settings page", () => {
    render(<SettingsButton />);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("titles a page without a breadcrumb trail", () => {
    render(<PageTitle title="Service status" subtitle="Train 7851 · Northeast Corridor Line" />);

    expect(screen.getByRole("heading", { name: "Service status" })).toBeTruthy();
    expect(screen.getByText("Train 7851 · Northeast Corridor Line")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders a delayed departure with its timetable, train, line, and track", () => {
    render(<DepartureRow departure={departure} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" />);
    expect(screen.getByText("Trenton")).toBeTruthy(); expect(screen.getByText("#1234")).toBeTruthy(); expect(screen.getByLabelText("Track 5")).toBeTruthy(); expect(screen.getByText("11:00 AM")).toBeTruthy(); expect(screen.getByText("11:05 AM")).toBeTruthy();
  });

  it("makes the whole rail row one tap target", () => {
    render(<DepartureRow departure={departure} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" />);

    const row = screen.getByText("Trenton").closest("li")!;
    expect(within(row).getAllByRole("link")).toHaveLength(1);
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
  });

  it("shows initial request failures with a retry affordance", async () => {
    const fetchMock = vi.fn((input: unknown) => String(input).includes("service-advisories")
      ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
      : Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Couldn't load departures.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => !String(input).includes("service-advisories"))).toHaveLength(2));
  });

  it("renders rows and keeps fixture data distinct from a live response", async () => {
    let departureCalls = 0;
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      if (String(input).includes("service-advisories")) return Promise.resolve(new Response(JSON.stringify({ advisories: [] })));
      departureCalls += 1;
      return departureCalls === 1
        ? Promise.resolve(new Response(JSON.stringify({ departures: [departure], fixtures: true }), { status: 200 }))
        : Promise.reject(new Error("offline"));
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Sample data — add NJ Transit API credentials for live departures")).toBeTruthy();
    expect(screen.getByText("Trenton")).toBeTruthy();

    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(screen.getByText("Sample data — add NJ Transit API credentials for live departures")).toBeTruthy());
    expect(screen.queryByText(/Data is no longer live/)).toBeNull();
  });

  it("renders the rail board as one chronological list with no direction headings", async () => {
    const board = [
      { ...departure, id: "first", trainNumber: "first", destination: "Trenton", expectedTime: "2024-05-30T15:05:00.000Z" },
      { ...departure, id: "second", trainNumber: "second", destination: "Dover", delayMinutes: 0, status: "on-time" as const, expectedTime: "2024-05-30T15:10:00.000Z" },
      { ...departure, id: "third", trainNumber: "third", destination: "Long Branch", delayMinutes: 0, status: "on-time" as const, expectedTime: "2024-05-30T15:20:00.000Z" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown) =>
        String(input).includes("service-advisories")
          ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
          : Promise.resolve(
              new Response(JSON.stringify({ departures: board, fixtures: false })),
            ),
      ),
    );

    render(<DepartureBoard code="NY" />);

    expect(await screen.findAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Trenton"),
      expect.stringContaining("Dover"),
      expect.stringContaining("Long Branch"),
    ]);
    expect(screen.queryByRole("heading", { name: /bound|other departures/i })).toBeNull();

    // A delayed train shows its timetabled identity struck through beside the
    // later time it will actually leave.
    const delayed = screen.getAllByRole("listitem")[0]!;
    expect(within(delayed).getByText("11:00 AM").className).toContain("line-through");
    expect(within(delayed).getByText("11:05 AM")).toBeTruthy();

    expect(screen.queryByRole("button", { name: /watch/i })).toBeNull();
  });

  it("explains airport service and only surfaces Secaucus when it distinguishes a destination", async () => {
    const board = [
      { ...departure, id: "via", trainNumber: "via", destination: "New York Penn Station", viaSecaucus: true },
      { ...departure, id: "direct", trainNumber: "direct", destination: "New York Penn Station", viaSecaucus: false, servesNewarkAirport: true, expectedTime: "2024-05-30T15:10:00.000Z" },
    ];
    vi.stubGlobal("fetch", vi.fn((input: unknown) =>
      String(input).includes("service-advisories")
        ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
        : Promise.resolve(new Response(JSON.stringify({ departures: board, fixtures: false }))),
    ));

    render(<DepartureBoard code="HB" />);

    expect(await screen.findByText("Airport service")).toBeTruthy();
    expect(screen.getByText("via Secaucus")).toBeTruthy();
    expect(screen.queryByText("✈")).toBeNull();
    expect(screen.getByLabelText("Serves Newark Airport")).toBeTruthy();
  });

  it("uses a high-contrast unassigned track marker without changing its accessible name", () => {
    render(<DepartureRow departure={{ ...departure, track: "" }} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" />);

    const marker = screen.getByLabelText("Track not yet assigned");
    expect(marker.className).toContain("text-text");
    expect(marker.textContent).toBe("–");
  });

  it("shows a train's live position as a labelled signal circuit, not a track", () => {
    render(<DepartureRow departure={{ ...departure, track: "", position: { circuit: "NY-7112TK", atPenn: true, updatedAt: null } }} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" />);

    expect(screen.getByText("At Penn")).toBeTruthy();
    expect(screen.getByText("NY-7112TK")).toBeTruthy();
    expect(screen.getByLabelText("Track not yet assigned").textContent).toBe("–");
    expect(screen.queryByText("On platform")).toBeNull();
  });

  it("labels a position outside Penn as a position", () => {
    render(<DepartureRow departure={{ ...departure, track: "", position: { circuit: "HO-7021TK", atPenn: false, updatedAt: null } }} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" />);

    expect(screen.getByText("Position")).toBeTruthy();
    expect(screen.queryByText("At Penn")).toBeNull();
  });

  it("shows a history-backed platform as an outlined, captioned chip rather than a posted track", () => {
    render(<DepartureRow departure={{ ...departure, track: "", position: { circuit: "NY-9TK", atPenn: true, updatedAt: null, historyTrack: "9" } }} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" />);

    const marker = screen.getByLabelText("Train on the circuit for track 9, not yet announced");
    expect(marker.textContent).toBe("9");
    expect(marker.className).not.toContain("bg-track");
    expect(screen.getByText("On platform")).toBeTruthy();
  });

  it("keeps service notices off the rail board and the freshness warning on its own line", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2024-05-30T15:00:00.000Z");
    let departureCalls = 0;
    const fetchMock = vi.fn<(input: unknown) => Promise<Response>>(() => {
      departureCalls += 1;
      return departureCalls === 1
        ? Promise.resolve(new Response(JSON.stringify({ departures: [departure], fixtures: false })))
        : Promise.reject(new Error("offline"));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Trenton")).toBeTruthy();
    // Notices have their own page, reached from the station header; the
    // board itself neither fetches nor shows them.
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("service-advisories"))).toBe(false);
    expect(screen.queryByText(/Service status/)).toBeNull();

    // "This board may be wrong" is board context, so it still shows here.
    vi.setSystemTime("2024-05-30T15:02:00.000Z");
    fireEvent(document, new Event("visibilitychange"));
    const freshness = await screen.findByRole("status");
    expect(freshness.textContent).toContain("Data is no longer live — last updated 2 minutes ago");
    expect(within(freshness).queryByRole("button")).toBeNull();
  });

  it("retains departures after any later failure, reports their age, and clears the warning on recovery", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2024-05-30T15:00:00.000Z");
    let departureCalls = 0;
    const fetchMock = vi.fn((input: unknown) => {
      if (String(input).includes("service-advisories")) return Promise.resolve(new Response(JSON.stringify({ advisories: [] })));
      departureCalls += 1;
      if (departureCalls === 1 || departureCalls === 3) return Promise.resolve(new Response(JSON.stringify({ departures: [departure], fixtures: false }), { status: 200 }));
      return Promise.reject(new Error("upstream unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Trenton")).toBeTruthy();

    vi.setSystemTime("2024-05-30T15:02:00.000Z");
    fireEvent(document, new Event("visibilitychange"));
    expect((await screen.findByRole("status")).textContent).toContain(
      "Data is no longer live — last updated 2 minutes ago",
    );
    expect(screen.getByText("Trenton")).toBeTruthy();

    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(screen.queryByText(/Data is no longer live/)).toBeNull());
  });

  it("shows a retryable initial stop error, then retains stops with an age-bearing freshness warning", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2024-05-30T15:00:00.000Z");
    let stopCalls = 0;
    const fetchMock = vi.fn((input: unknown) => {
      if (String(input).includes("service-advisories")) return Promise.resolve(new Response(JSON.stringify({ advisories: [] })));
      stopCalls += 1;
      if (stopCalls === 2 || stopCalls === 4) return Promise.resolve(new Response(JSON.stringify({ stopList, fixtures: false }), { status: 200 }));
      return Promise.reject(new Error("upstream unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StopList train="1234" from="NY" />);
    expect(await screen.findByText("Couldn't load stops.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("New York Penn Station")).toBeTruthy();

    vi.setSystemTime("2024-05-30T15:03:01.000Z");
    fireEvent(document, new Event("visibilitychange"));
    expect((await screen.findByRole("status")).textContent).toContain(
      "Data is no longer live — last updated 3 minutes ago",
    );
    expect(screen.getByText("New York Penn Station")).toBeTruthy();

    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(screen.queryByText(/Data is no longer live/)).toBeNull());

    vi.setSystemTime("2024-05-30T15:05:02.000Z");
    fireEvent(document, new Event("visibilitychange"));
    expect((await screen.findByRole("status")).textContent).toContain(
      "Data is no longer live — last updated 2 minutes ago",
    );
  });

  it("registers the service worker only in production browsers that support it", () => {
    vi.stubEnv("NODE_ENV", "production");
    const register = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
    render(<ServiceWorkerRegistrar />); expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("shows saved boards as Favorites and leaves nearby boards to their own page", () => {
    window.localStorage.setItem("departure-board:favorites", JSON.stringify(["NY"]));
    window.localStorage.setItem(
      "departure-board:recent-stations",
      JSON.stringify(["AM", "AN", "AS", "AH", "AZ"]),
    );

    render(<StationPicker />);

    const favorites = screen.getByRole("heading", { name: "Favorites" }).closest("section")!;
    expect(within(favorites).getAllByRole("link").map((link) => link.textContent)).toEqual([
      expect.stringContaining("New York Penn Station"),
    ]);
    expect(within(favorites).queryByText("fav")).toBeNull();
    expect(within(favorites).queryByText("nearby")).toBeNull();
    expect(screen.getByRole("link", { name: "Nearby" }).getAttribute("href")).toBe("/nearby");
    expect(screen.queryByRole("button", { name: "Clear recent stations" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove .*recent stations/ })).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("qualifies Home choices with a textual system chip and removes the line filter", () => {
    render(<StationPicker />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stations" }), {
      target: { value: "Aberdeen" },
    });
    expect(screen.getByText("Aberdeen-Matawan")).toBeTruthy();
    expect(screen.getByText("NJT")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filter stations" })).toBeNull();

    window.localStorage.setItem("departure-board:favorites", JSON.stringify(["NY"]));
    cleanup();
    render(<StationPicker />);
    const favorites = screen.getByRole("heading", { name: "Favorites" }).closest("section")!;
    expect(within(favorites).getByText("New York Penn Station")).toBeTruthy();
    expect(within(favorites).getByText("NJT")).toBeTruthy();
    expect(within(favorites).queryByText("fav")).toBeNull();
  });

  it("searches both systems from one box and tells repeated Subway names apart", () => {
    render(<StationPicker />);
    const search = screen.getByRole("searchbox", { name: "Search stations" });

    fireEvent.change(search, { target: { value: "newark" } });
    const results = screen.getByRole("region", { name: "Search results" });
    const links = within(results).getAllByRole("link");
    expect(links.some((link) => link.textContent?.includes("Newark Penn Station") && link.textContent?.includes("NJT"))).toBe(true);

    fireEvent.change(search, { target: { value: "times sq" } });
    const timesSquare = within(screen.getByRole("region", { name: "Search results" })).getAllByRole("link");
    expect(timesSquare[0]!.textContent).toContain("Subway");
    expect(timesSquare[0]!.getAttribute("href")).toMatch(/^\/subway\/station\//);

    // Eight stations are called "86 St"; the routes on each row are what tells
    // a rider which one they mean, in text rather than only in colour.
    fireEvent.change(search, { target: { value: "86 St" } });
    const eightySixth = within(screen.getByRole("region", { name: "Search results" }))
      .getAllByRole("link")
      .filter((link) => link.textContent?.startsWith("86 St"));
    expect(eightySixth.length).toBeGreaterThan(3);
    expect(new Set(eightySixth.map((link) => link.textContent)).size).toBe(eightySixth.length);

    // Published names remain searchable as aliases on direct provider station boards.
    fireEvent.change(search, { target: { value: "World Trade Center" } });
    expect(screen.getAllByText(/also .*World Trade Center/).length).toBeGreaterThan(0);
  });

  it("keeps saved boards from both systems and both storage generations resolving", () => {
    // A bare code is the app's pre-Subway format; an MTA member id predates
    // that complex being listed under one title.
    window.localStorage.setItem("departure-board:favorites", JSON.stringify(["NY", "subway:128"]));
    window.localStorage.setItem("departure-board:recent-stations", JSON.stringify(["subway:R20", "AM"]));

    render(<StationPicker />);

    // Both favorite Penn choices resolve to their provider-owned station
    // boards. Recent choices are deliberately not rendered on Home.
    const favorites = screen.getByRole("heading", { name: "Favorites" }).closest("section")!;
    expect(within(favorites).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/station/NY",
      "/subway/station/128",
    ]);
    expect(within(favorites).queryByText("fav")).toBeNull();
    expect(within(favorites).queryByText("recent")).toBeNull();
  });

  it("autocompletes misspelled station names and opens the top match on Enter", () => {
    window.localStorage.setItem("departure-board:favorites", JSON.stringify(["NY"]));
    render(<StationPicker />);
    const search = screen.getByRole("searchbox", { name: "Search stations" });

    fireEvent.change(search, { target: { value: "colombus circel" } });
    const suggestions = within(screen.getByRole("region", { name: "Search results" })).getAllByRole("link");
    expect(suggestions[0]!.textContent).toContain("59 St-Columbus Circle");
    expect(suggestions.length).toBeLessThanOrEqual(8);

    // Searching replaces Favorites: a rider typing is not reaching for one.
    expect(screen.queryByRole("heading", { name: "Favorites" })).toBeNull();

    fireEvent.keyDown(search, { key: "Enter" });
    expect(window.location.pathname).toBe(suggestions[0]!.getAttribute("href"));
  });

  it("swaps Favorites for the station list as soon as the search box is focused", () => {
    window.localStorage.setItem("departure-board:favorites", JSON.stringify(["NP"]));
    render(<StationPicker />);
    const search = screen.getByRole("searchbox", { name: "Search stations" });
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeTruthy();

    // Focus alone lists stations, busiest first, in place of Favorites.
    fireEvent.focus(search);
    expect(screen.queryByRole("heading", { name: "Favorites" })).toBeNull();
    const all = within(screen.getByRole("region", { name: "Search results" })).getAllByRole("link");
    expect(all.length).toBeGreaterThan(100);
    expect(all[0]!.textContent).toContain("Hoboken");
    // Enter does nothing until there is a query to act on.
    fireEvent.keyDown(search, { key: "Enter" });
    expect(window.location.pathname).toBe("/");

    // Each keystroke narrows the list.
    fireEvent.change(search, { target: { value: "penn" } });
    const penn = within(screen.getByRole("region", { name: "Search results" })).getAllByRole("link");
    expect(penn.length).toBeLessThanOrEqual(8);
    expect(penn[0]!.textContent).toContain("New York Penn Station");

    // Escape leaves search and brings Favorites back.
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Search results" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeTruthy();

    // So does focus leaving an empty box.
    fireEvent.focus(search);
    expect(screen.queryByRole("heading", { name: "Favorites" })).toBeNull();
    fireEvent.blur(search, { relatedTarget: document.body });
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeTruthy();
  });

  it("presents Penn's provider station boards as separate choices", () => {
    render(<StationPicker />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search stations" }), {
      target: { value: "Penn Station" },
    });

    const penn = within(screen.getByRole("region", { name: "Search results" }))
      .getAllByRole("link")
      .filter((link) => ["/station/NY", "/subway/station/128", "/subway/station/A28"].includes(link.getAttribute("href") ?? ""));
    expect(penn.map((link) => link.getAttribute("href"))).toEqual([
      "/station/NY",
      "/subway/station/128",
      "/subway/station/A28",
    ]);
    // The provider chip and route labels make the destination choices explicit.
    expect(penn[0]!.textContent).toContain("NJT");
    expect(penn[1]!.textContent).toContain("Subway");
    expect(penn[1]!.textContent).toContain("1, 2, 3 trains");
    expect(penn[2]!.textContent).toContain("A, C, E trains");
  });

  it("keeps two provider boards independent when one of them fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes("service-advisories")) return Promise.resolve(new Response(JSON.stringify({ advisories: [] })));
      // MTA is down; NJ TRANSIT is fine.
      if (url.includes("/subway/")) return Promise.reject(new Error("MTA unavailable"));
      return Promise.resolve(new Response(JSON.stringify({ departures: [departure], fixtures: false })));
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Only one provider board is mounted at a time, so neither can blank or
    // stale the other.
    const njt = render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Trenton")).toBeTruthy();
    expect(screen.queryByText(/Data is no longer live/)).toBeNull();
    njt.unmount();

    render(<SubwayBoard stationId="128,A28" />);
    expect(await screen.findByText("Couldn't load departures.")).toBeTruthy();
    expect(screen.queryByText("Trenton")).toBeNull();
  });

  it("merges the two MTA Penn stations into shared Uptown and Downtown groups", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      requested.push(String(input));
      return Promise.resolve(new Response(JSON.stringify({
        station: { id: "128,A28", name: "34 St-Penn Station" },
        sourceTimestamp: "2026-08-04T12:00:00.000Z",
        departures: [
          { id: "mta:numbered:one:128", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", nextStop: "Times Sq-42 St", expectedTime: "2026-08-04T12:03:00.000Z", stationId: "128" },
          { id: "mta:ace:two:A28", route: "A", direction: "Uptown", destination: "Inwood-207 St", nextStop: "42 St-Port Authority Bus Terminal", expectedTime: "2026-08-04T12:05:00.000Z", stationId: "A28" },
          { id: "mta:ace:three:A28", route: "E", direction: "Downtown", destination: "World Trade Center", nextStop: "23 St", expectedTime: "2026-08-04T12:06:00.000Z", stationId: "A28" },
        ],
      })));
    }));

    render(<SubwayBoard stationId="128,A28" />);

    // One request covering both provider stations; their identities stay
    // distinct upstream and only the published labels merge here.
    expect(await screen.findByRole("heading", { name: "Uptown" })).toBeTruthy();
    expect(requested[0]).toContain("/api/subway/departures/128,A28");
    const uptown = screen.getByRole("heading", { name: "Uptown" }).closest("section")!;
    expect(within(uptown).getAllByRole("listitem")).toHaveLength(2);
    expect(within(uptown).getByLabelText("1 train")).toBeTruthy();
    expect(within(uptown).getByLabelText("A train")).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: "Downtown" }).closest("section")!).getAllByRole("listitem")).toHaveLength(1);

    // No System chip inside a single-system board's own rows.
    for (const row of screen.getAllByRole("listitem")) {
      expect(row.textContent).not.toMatch(/\bNJT\b|\bSubway\b/);
    }
  });

  it("offers Penn's explicit transfer targets from an upcoming stop", async () => {
    const njtStops: StopListData = {
      ...stopList,
      stops: [
        { code: "NB", name: "New Brunswick", time: "2024-05-30T15:00:00.000Z", departed: true, pickupOnly: false, dropoffOnly: false },
        { code: "NY", name: "New York Penn Station", time: "2024-05-30T15:40:00.000Z", departed: false, pickupOnly: false, dropoffOnly: false },
      ],
    };
    vi.stubGlobal("fetch", vi.fn((input: unknown) =>
      String(input).includes("service-advisories")
        ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
        : Promise.resolve(new Response(JSON.stringify({ stopList: njtStops, fixtures: false })))));

    const njt = render(<StopList train="1234" from="NB" />);
    const to123 = await screen.findByRole("link", { name: /Transfer to 1\/2\/3 at New York Penn Station/ });
    const toAce = screen.getByRole("link", { name: /Transfer to A\/C\/E at New York Penn Station/ });
    expect(to123.getAttribute("href")).toBe("/subway/station/128");
    expect(toAce.getAttribute("href")).toBe("/subway/station/A28");
    // Only the transfer stop carries transfer choices, and only while it is still ahead.
    expect(screen.getAllByRole("link", { name: /Transfer to/ })).toHaveLength(2);
    njt.unmount();

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      id: "mta:numbered:trip:127", route: "1", direction: "Downtown", destination: "South Ferry",
      stops: [
        { id: "127", name: "Times Sq-42 St", time: "2026-08-04T12:01:00.000Z" },
        { id: "128", name: "34 St-Penn Station", time: "2026-08-04T12:04:00.000Z" },
      ],
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
    })))));

    render(<SubwayStopList tripId="mta:numbered:trip:127" />);
    const toNjt = await screen.findByRole("link", { name: /Transfer to NJT at New York Penn Station/ });
    const toAceFrom123 = screen.getByRole("link", { name: /Transfer to A\/C\/E at New York Penn Station/ });
    expect(toNjt.getAttribute("href")).toBe("/station/NY");
    expect(toAceFrom123.getAttribute("href")).toBe("/subway/station/A28");
  });

  it("labels station transfer links with their destination routes", () => {
    render(<StationTransferLinks system="njt" stationId="NY" />);

    const to123 = screen.getByRole("link", { name: "Transfer to 1/2/3 trains at New York Penn Station" });
    const toAce = screen.getByRole("link", { name: "Transfer to A/C/E trains at New York Penn Station" });
    const to123Icons = [...to123.querySelectorAll("[aria-hidden=\"true\"] > span")];
    const toAceIcons = [...toAce.querySelectorAll("[aria-hidden=\"true\"] > span")];
    expect(to123Icons.map((icon) => icon.textContent)).toEqual(["1", "2", "3"]);
    expect(toAceIcons.map((icon) => icon.textContent)).toEqual(["A", "C", "E"]);
    expect(to123Icons.every((icon) => icon.classList.contains("h-6") && icon.classList.contains("w-6"))).toBe(true);
    expect(toAceIcons.every((icon) => icon.classList.contains("h-6") && icon.classList.contains("w-6"))).toBe(true);
    expect(to123.textContent).toContain("trains");
    expect(toAce.textContent).toContain("trains");
    expect(screen.queryByText(/View/)).toBeNull();
  });

  it("shows Times Sq's other station boards from the 1/2/3 board", () => {
    render(<StationTransferLinks system="subway" stationId="127" />);

    expect(screen.getByRole("link", { name: "Transfer to 7 trains at Times Sq-42 St" }).getAttribute("href"))
      .toBe("/subway/station/725");
    expect(screen.getByRole("link", { name: "Transfer to S trains at Times Sq-42 St" }).getAttribute("href"))
      .toBe("/subway/station/902");
    expect(screen.getByRole("link", { name: "Transfer to A/C/E trains at 42 St-Port Authority Bus Terminal" }).getAttribute("href"))
      .toBe("/subway/station/A27");
    expect(screen.getByRole("link", { name: "Transfer to N/Q/R/W trains at Times Sq-42 St" }).getAttribute("href"))
      .toBe("/subway/station/R16");
  });

  it("uses route bullets for exact-train Subway transfer links", () => {
    render(<TransferLinks system="subway" stationId="A24" />);

    const link = screen.getByRole("link", { name: "Transfer to 1 at 59 St-Columbus Circle" });
    expect([...link.querySelectorAll("[aria-hidden=\"true\"] > span")].map((icon) => icon.textContent)).toEqual(["1"]);
  });

  it("uses dark text on yellow route bullets and white on provider-native colors", () => {
    render(<SubwayRouteIcons routes={["N", "1", "L"]} />);

    expect(screen.getByText("N").getAttribute("style")).toContain("color: rgb(24, 24, 27)");
    expect(screen.getByText("1").getAttribute("style")).toContain("color: rgb(255, 255, 255)");
    expect(screen.getByText("L").getAttribute("style")).toContain("color: rgb(255, 255, 255)");
  });

  it("only requests location on Nearby and orders the nearby boards", async () => {
    const getCurrentPosition = vi.fn((onSuccess: PositionCallback) => onSuccess({
      coords: { latitude: 40.7359, longitude: -73.9906 },
    } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition,
      },
    });

    render(<StationPicker />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    cleanup();

    render(<NearbyStations />);
    expect(await screen.findByRole("heading", { name: "Nearby" })).toBeTruthy();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);

    const nearby = screen.getByRole("heading", { name: "Closest first" }).closest("section")!;
    expect(within(nearby).getAllByText("Subway").length).toBeGreaterThan(0);
    expect(within(nearby).getAllByRole("link")[0]!.getAttribute("href")).toMatch(/^\/subway\/station\//);
    expect(within(nearby).getAllByText(/right here|mi away/).length).toBeGreaterThan(0);
    expect(within(nearby).queryByText("Atlantic City Rail Terminal")).toBeNull();
  });

  it("explains when the browser denies Nearby location access", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_onSuccess: PositionCallback, onError: PositionErrorCallback) => onError({
          code: 1,
          message: "User denied Geolocation",
        } as GeolocationPositionError),
      },
    });

    render(<NearbyStations />);

    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("Location access was denied");
    expect(error.textContent).toContain("Allow location access");
    expect(screen.queryByText("Finding nearby stations…")).toBeNull();
  });

  it("ignores and clears watch state left over from before watches were retired", () => {
    window.localStorage.setItem("departure-board:watches", JSON.stringify([
      { stationCode: "NY", trainNumber: "1234", scheduledTime: "2024-05-30T15:00:00.000Z", destination: "Trenton", expectedTime: "2024-05-30T15:05:00.000Z", status: "delayed", track: "5", line: "Northeast Corridor Line", lineCode: "NE" },
    ]));

    render(<><RetiredWatchStateCleanup /><StationPicker /></>);

    expect(screen.getByRole("heading", { name: "Departures" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Watched departures" })).toBeNull();
    expect(window.localStorage.getItem("departure-board:watches")).toBeNull();
  });

  it("hides empty Favorites and offers no directory drop-down", () => {
    window.localStorage.setItem("departure-board:recent-stations", JSON.stringify(["NY"]));

    render(<StationPicker />);

    expect(screen.queryByRole("heading", { name: "Favorites" })).toBeNull();
    expect(screen.queryByText(/No favorites yet/)).toBeNull();
    expect(screen.queryByText("recent")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove .*recent stations/ })).toBeNull();
    expect(screen.queryByText("Browse all stations")).toBeNull();
    expect(screen.queryByRole("region", { name: "Search results" })).toBeNull();
  });
});
