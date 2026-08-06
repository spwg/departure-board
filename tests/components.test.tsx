import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SettingsButton } from "@/components/SettingsButton";
import { DepartureBoard } from "@/components/DepartureBoard";
import { DepartureRow } from "@/components/DepartureRow";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { RetiredWatchStateCleanup } from "@/components/RetiredWatchStateCleanup";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { StationPicker } from "@/components/StationPicker";
import { StopList } from "@/components/StopList";
import { SubwayBoard } from "@/components/SubwayBoard";
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

    // Every row carries its boarding cue, and nothing else: no clock time
    // beside the countdown, and no direction restating the heading above it.
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Times Sq-42 St")).toBeTruthy();
    expect(within(rows[1]!).getByText("14 St")).toBeTruthy();
    for (const row of rows) {
      expect(within(row).getByText("Next stop")).toBeTruthy();
      expect(row.textContent).not.toMatch(/\d:\d\d/);
      expect(row.textContent).not.toMatch(/Uptown|Downtown/);
    }
  });

  it("shows every Subway departure in every direction group under a pinned heading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    const minutes = [1, 2, 3, 4, 5, 6];
    const departures = [
      ...minutes.map((minute) => ({ id: `up-${minute}`, route: "1", direction: "Uptown", destination: `Uptown destination ${minute}`, nextStop: "Times Sq-42 St", expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
      ...minutes.map((minute) => ({ id: `down-${minute}`, route: "2", direction: "Downtown", destination: `Downtown destination ${minute}`, nextStop: "14 St", expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
    ];
    // The board arrives chronologically; grouping must not reorder within a group.
    departures.sort((a, b) => a.expectedTime.localeCompare(b.expectedTime));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures,
    })))));

    // A direction-focus parameter left in an old bookmark no longer narrows
    // anything — the concept it selected is gone.
    window.history.replaceState(null, "", "/subway/station/127?direction=Uptown");
    render(<SubwayBoard stationId="127" />);

    const uptown = (await screen.findByRole("heading", { name: "Uptown" })).closest("section")!;
    const downtown = screen.getByRole("heading", { name: "Downtown" }).closest("section")!;
    expect(within(uptown).getAllByRole("listitem")).toHaveLength(6);
    expect(within(downtown).getAllByRole("listitem")).toHaveLength(6);
    expect(within(uptown).getAllByRole("listitem").map((row) => row.textContent)).toEqual(
      minutes.map((minute) => expect.stringContaining(`Uptown destination ${minute}`)),
    );

    expect(screen.queryByRole("button", { name: /view all/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /all directions/i })).toBeNull();
    for (const heading of screen.getAllByRole("heading", { level: 2 })) {
      expect(heading.className).toContain("sticky");
    }
  });

  it("filters Subway destinations with bookmarkable OR semantics while preserving direction groups", async () => {
    window.history.replaceState(null, "", "/subway/station/127?destination=mta%3Astop%3AWK&destination=unknown");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures: [
        { id: "up-bronx", route: "2", direction: "Uptown", destination: "Wakefield-241 St", nextStop: "Times Sq-42 St", destinationId: "mta:stop:WK", expectedTime: "2026-08-04T12:05:00.000Z" },
        { id: "up-manhattan", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", nextStop: "Times Sq-42 St", destinationId: "mta:stop:VC", expectedTime: "2026-08-04T12:06:00.000Z" },
        { id: "down-brooklyn", route: "2", direction: "Downtown", destination: "Flatbush Av-Brooklyn College", nextStop: "14 St", destinationId: "mta:stop:FB", expectedTime: "2026-08-04T12:07:00.000Z" },
      ],
    })))));

    const view = render(<SubwayBoard stationId="127" />);

    expect(await screen.findByRole("button", { name: /filter destinations/i })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Wakefield-241 St" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByText("Wakefield-241 St")).toHaveLength(2);
    expect(screen.getAllByText("Van Cortlandt Park-242 St")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Downtown" })).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Flatbush Av-Brooklyn College" }));
    expect(window.location.search).toBe("?destination=mta%3Astop%3AWK&destination=mta%3Astop%3AFB");
    view.rerender(<SubwayBoard stationId="127" />);
    expect(screen.getByRole("heading", { name: "Uptown" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Downtown" })).toBeTruthy();
    expect(screen.getAllByText("Flatbush Av-Brooklyn College")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(window.location.search).toBe("");
    view.rerender(<SubwayBoard stationId="127" />);
    expect(screen.getAllByText("Van Cortlandt Park-242 St")).toHaveLength(1);
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

  it("lets riders explicitly select 24-hour time", () => {
    render(<SettingsButton />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const button = screen.getByRole("radio", { name: /24-hour/i });
    expect(button.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-checked")).toBe("true");
    expect(button.textContent).toContain("19:05");
    expect(window.localStorage.getItem("departure-board:use-24-hour-time")).toBe("true");

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
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

  it("filters NJT destinations from the URL without persisting them", async () => {
    window.history.replaceState(null, "", "/station/NY?destination=Trenton&destination=Dover&destination=unknown");
    const board = [
      { ...departure, id: "east", trainNumber: "east", destination: "Trenton" },
      { ...departure, id: "west", trainNumber: "west", destination: "Dover" },
      { ...departure, id: "other", trainNumber: "other", destination: "Long Branch" },
    ];
    vi.stubGlobal("fetch", vi.fn((input: unknown) =>
      String(input).includes("service-advisories")
        ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
        : Promise.resolve(new Response(JSON.stringify({ departures: board, fixtures: false }))),
    ));

    const view = render(<DepartureBoard code="NY" />);

    expect(await screen.findByRole("checkbox", { name: "Trenton" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Dover" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByText("Long Branch")).toHaveLength(1);
    expect(window.localStorage.length).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(window.location.search).toBe("");
    view.rerender(<DepartureBoard code="NY" />);
    expect(screen.getAllByText("Long Branch")).toHaveLength(1);

    window.history.replaceState(null, "", "/station/NY?destination=njt%3Anever");
    view.rerender(<DepartureBoard code="NY" />);
    expect(screen.getByText("No live departures match this destination filter.")).toBeTruthy();
  });

  it("puts every service notice on one summary line and the freshness warning on its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2024-05-30T15:00:00.000Z");
    const notice = (id: string, severity: "disruption" | "advisory") => ({
      id, revision: `${id}-r`, severity, text: `${id} notice text`,
      url: `https://www.njtransit.com/node/${id}`, publishedAt: null,
    });
    const advisories = [notice("a", "disruption"), notice("b", "disruption"), notice("c", "advisory")];
    let departureCalls = 0;
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      if (String(input).includes("service-advisories")) {
        return Promise.resolve(new Response(JSON.stringify({
          advisories,
          authoritativeRevisions: Object.fromEntries(advisories.map((a) => [a.id, a.revision])),
        })));
      }
      departureCalls += 1;
      return departureCalls === 1
        ? Promise.resolve(new Response(JSON.stringify({ departures: [departure], fixtures: false })))
        : Promise.reject(new Error("offline"));
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(<DepartureBoard code="NY" />);
    const summary = await screen.findByText("Service status — 2 disruptions, 1 advisory");
    expect(container.querySelectorAll("details")).toHaveLength(1);
    // Not one of the three, current or not, takes a line above the departures.
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
    for (const advisory of advisories) {
      expect(screen.getByText(advisory.text).closest("details")).toBe(summary.closest("details"));
    }

    // "This board may be wrong" is a different claim from "the railroad has
    // news", so it keeps its own line rather than joining the summary.
    vi.setSystemTime("2024-05-30T15:02:00.000Z");
    fireEvent(document, new Event("visibilitychange"));
    const freshness = await screen.findByRole("status");
    expect(freshness.textContent).toContain("Data is no longer live — last updated 2 minutes ago");
    expect(freshness.closest("details")).toBeNull();
    expect(within(freshness).queryByRole("button")).toBeNull();
    expect(screen.getByText("Service status — 2 disruptions, 1 advisory")).toBeTruthy();
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

  it("keeps the picker open, explains nearby and recent stations, and lets riders undo a history clear", async () => {
    const recorder = render(<RecentStationRecorder choice={njtBoardChoice("AM")} />);
    for (const code of ["AB", "AZ", "AH", "AS", "AN", "AM"]) {
      recorder.rerender(<RecentStationRecorder choice={njtBoardChoice(code)} />);
    }
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (onSuccess: PositionCallback) => onSuccess({
          coords: { latitude: 40.7505, longitude: -73.9934 },
        } as GeolocationPosition),
      },
    });

    render(<StationPicker />);

    const recent = screen.getByRole("heading", { name: "Recent stations" }).closest("section")!;
    expect(within(recent).getAllByRole("link").map((link) => link.textContent)).toEqual([
      expect.stringContaining("Aberdeen-Matawan"),
      expect.stringContaining("Annandale"),
      expect.stringContaining("Anderson Street"),
      expect.stringContaining("Allenhurst"),
      expect.stringContaining("Allendale"),
    ]);
    expect(await screen.findByRole("heading", { name: "Nearest station" })).toBeTruthy();
    expect(screen.getByText(/Nearest station ·/)).toBeTruthy();
    expect(window.location.pathname).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: "Clear recent stations" }));
    expect(screen.queryByRole("heading", { name: "Recent stations" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo clearing recent stations" }));
    expect(screen.getByRole("heading", { name: "Recent stations" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear recent stations" }));
    recorder.rerender(<RecentStationRecorder choice={njtBoardChoice("NY")} />);
    const repopulatedRecent = screen.getByRole("heading", { name: "Recent stations" }).closest("section")!;
    expect(within(repopulatedRecent).getByText("New York Penn Station")).toBeTruthy();
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
    render(<StationPicker />);
    const favorites = screen.getAllByRole("heading", { name: "Favorites" })[0]!.closest("section")!;
    expect(within(favorites).getByText("New York Penn Station")).toBeTruthy();
    expect(within(favorites).getByText("NJT")).toBeTruthy();
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

  it("keeps the full directory collapsed and avoids repeating a recent nearest station", async () => {
    window.localStorage.setItem("departure-board:recent-stations", JSON.stringify(["NY"]));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (onSuccess: PositionCallback) => onSuccess({
          coords: { latitude: 40.7505, longitude: -73.9934 },
        } as GeolocationPosition),
      },
    });

    render(<StationPicker />);

    expect(await screen.findByRole("heading", { name: "Recent stations" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Nearest station" })).toBeNull();
    const directory = screen.getByText("Browse all stations").closest("details")!;
    expect(directory.open).toBe(false);

    fireEvent.click(screen.getByText("Browse all stations"));
    expect(directory.open).toBe(true);
  });
});
