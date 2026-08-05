import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SettingsButton } from "@/components/SettingsButton";
import { DepartureBoard } from "@/components/DepartureBoard";
import { DepartureRow } from "@/components/DepartureRow";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { StationPicker } from "@/components/StationPicker";
import { StopList } from "@/components/StopList";
import { WatchedDepartures } from "@/components/WatchedDepartures";
import { SubwayBoard } from "@/components/SubwayBoard";
import { njtBoardChoice } from "@/lib/boardChoices";
import type { Departure } from "@/lib/departures";
import type { StopList as StopListData } from "@/lib/stops";
import { watchDeparture, watchedDepartures } from "@/lib/watches";

const departure: Departure = { id: "1", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:05:00.000Z", trainNumber: "1234", line: "Northeast Corridor Line", lineCode: "NE", track: "5", status: "delayed", statusText: "5 Min Late", delayMinutes: 5 };
const stopList: StopListData = { trainNumber: "1234", lineCode: "NE", destination: "Trenton", transferAt: "", stops: [{ code: "NY", name: "New York Penn Station", time: "2024-05-30T15:00:00.000Z", departed: false, pickupOnly: false, dropoffOnly: false }] };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(navigator, "geolocation");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("interactive component contract", () => {
  it("renders a live Subway board with simultaneous official directions and provider-native rows", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures: [
        { id: "mta:a:127", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", expectedTime: "2026-08-04T12:05:00.000Z" },
        { id: "mta:b:127", route: "2", direction: "Downtown", destination: "Flatbush Av-Brooklyn College", expectedTime: "2026-08-04T12:07:00.000Z" },
      ],
    })))));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    render(<SubwayBoard stationId="127" />);
    expect(await screen.findByRole("heading", { name: "Uptown" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Downtown" })).toBeTruthy();
    expect(screen.getByLabelText("1 train")).toBeTruthy();
    expect(screen.getByText("Van Cortlandt Park-242 St")).toBeTruthy();
    expect(screen.getByText("5 min")).toBeTruthy();
  });

  it("previews both Subway directions before allowing each full list to expand", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime("2026-08-04T12:00:00.000Z");
    const departures = [
      ...[1, 2, 3].map((minute) => ({ id: `up-${minute}`, route: "1", direction: "Uptown", destination: `Uptown destination ${minute}`, expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
      ...[1, 2, 3].map((minute) => ({ id: `down-${minute}`, route: "2", direction: "Downtown", destination: `Downtown destination ${minute}`, expectedTime: `2026-08-04T12:0${minute}:00.000Z` })),
    ];
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      station: { id: "127", name: "34 St-Penn Station" },
      sourceTimestamp: "2026-08-04T12:00:00.000Z",
      departures,
    })))));

    render(<SubwayBoard stationId="127" />);

    expect(await screen.findByRole("heading", { name: "Uptown" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Downtown" })).toBeTruthy();
    expect(screen.queryByText("Uptown destination 3")).toBeNull();
    expect(screen.queryByText("Downtown destination 3")).toBeNull();

    const showUptown = screen.getByRole("button", { name: "Show 1 more Uptown train" });
    expect(showUptown.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(showUptown);
    expect(screen.getByText("Uptown destination 3")).toBeTruthy();
    expect(screen.queryByText("Downtown destination 3")).toBeNull();
    expect(screen.getByRole("button", { name: "Show fewer Uptown trains" }).getAttribute("aria-expanded")).toBe("true");
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
        departures: [{ id: "mta:a:127", route: "1", direction: "Uptown", destination: "Van Cortlandt Park-242 St", expectedTime: "2026-08-04T12:05:00.000Z" }],
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

  it("watches an exact departure and lets riders manage it from the home-page list", async () => {
    render(<><DepartureRow departure={departure} now={Date.parse("2024-05-30T15:00:00.000Z")} stationCode="NY" /><WatchedDepartures /></>);

    fireEvent.click(screen.getByRole("button", { name: "Watch train 1234 to Trenton" }));
    expect(await screen.findByRole("heading", { name: "Watched departures" })).toBeTruthy();
    expect(screen.getByText(/New York Penn Station/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unwatch train 1234 from New York Penn Station" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Unwatch train 1234 from New York Penn Station" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Watched departures" })).toBeNull());
  });

  it("leaves Watch reconciliation to the client watcher so board refreshes cannot absorb an alert", async () => {
    watchDeparture("NY", departure);
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      if (String(input).includes("service-advisories")) {
        return Promise.resolve(new Response(JSON.stringify({ advisories: [] })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        departures: [{ ...departure, expectedTime: "2024-05-30T15:07:00.000Z" }],
        fixtures: false,
      })));
    }));

    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Trenton")).toBeTruthy();
    expect(watchedDepartures()[0]?.expectedTime).toBe(departure.expectedTime);
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

  it("keeps official NJT direction groups and unmatched live departures visible", async () => {
    const grouped = [
      { ...departure, id: "east", trainNumber: "east", destination: "Trenton", direction: "Eastbound" as const },
      { ...departure, id: "west", trainNumber: "west", destination: "Dover", direction: "Westbound" as const },
      { ...departure, id: "other", trainNumber: "other", destination: "Long Branch" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown) =>
        String(input).includes("service-advisories")
          ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
          : Promise.resolve(
              new Response(JSON.stringify({ departures: grouped, fixtures: false })),
            ),
      ),
    );

    render(<DepartureBoard code="NY" />);

    expect(await screen.findByRole("heading", { name: "Eastbound" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Westbound" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Other departures" })).toBeNull();
    expect(screen.getByText("Trenton")).toBeTruthy();
    expect(screen.getByText("Dover")).toBeTruthy();
    expect(screen.getByText("Long Branch")).toBeTruthy();
  });

  it("keeps an all-unmatched live board as one neutral chronological list", async () => {
    const ungrouped = [
      { ...departure, id: "first", trainNumber: "first", destination: "Trenton" },
      { ...departure, id: "second", trainNumber: "second", destination: "Dover" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: unknown) =>
        String(input).includes("service-advisories")
          ? Promise.resolve(new Response(JSON.stringify({ advisories: [] })))
          : Promise.resolve(
              new Response(JSON.stringify({ departures: ungrouped, fixtures: false })),
            ),
      ),
    );

    render(<DepartureBoard code="NY" />);

    expect(await screen.findByText("Trenton")).toBeTruthy();
    expect(screen.getByText("Dover")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /bound|other departures/i })).toBeNull();
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
