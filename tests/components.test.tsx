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
  it("persists favourite choices and exposes the action through accessible state", async () => {
    render(<FavoriteButton code="NY" name="New York Penn Station" />);
    const button = screen.getByRole("button", { name: /add new york/i });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));
    expect(JSON.parse(window.localStorage.getItem("departure-board:favorites")!)).toEqual(["NY"]);
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
    const recorder = render(<RecentStationRecorder code="AM" />);
    for (const code of ["AB", "AZ", "AH", "AS", "AN", "AM"]) {
      recorder.rerender(<RecentStationRecorder code={code} />);
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
    recorder.rerender(<RecentStationRecorder code="NY" />);
    const repopulatedRecent = screen.getByRole("heading", { name: "Recent stations" }).closest("section")!;
    expect(within(repopulatedRecent).getByText("New York Penn Station")).toBeTruthy();
  });

  it("matches a selected line filter against any station line", () => {
    render(<StationPicker />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stations" }), {
      target: { value: "Aberdeen" },
    });
    expect(screen.getByText("Aberdeen-Matawan")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "North Jersey Coast Line" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Atlantic City Line" }));
    expect((screen.getByRole("checkbox", { name: "North Jersey Coast Line" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Atlantic City Line" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Aberdeen-Matawan")).toBeTruthy();
  });
});
