import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SettingsButton } from "@/components/SettingsButton";
import { DepartureBoard } from "@/components/DepartureBoard";
import { DepartureRow } from "@/components/DepartureRow";
import { RecentStationRecorder } from "@/components/RecentStationRecorder";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { StationPicker } from "@/components/StationPicker";
import type { Departure } from "@/lib/departures";

const departure: Departure = { id: "1", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:05:00.000Z", trainNumber: "1234", line: "Northeast Corridor Line", lineCode: "NE", track: "5", status: "delayed", statusText: "5 Min Late", delayMinutes: 5 };

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(navigator, "geolocation");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

  it("shows initial request failures with a retry affordance", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Couldn't load departures.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("renders rows and a fixture notice after a successful fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ departures: [departure], fixtures: true }), { status: 200 })));
    render(<DepartureBoard code="NY" />);
    expect(await screen.findByText("Sample data — add NJ Transit API credentials for live departures")).toBeTruthy(); expect(screen.getByText("Trenton")).toBeTruthy();
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
