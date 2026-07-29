import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DepartureRow } from "@/components/DepartureRow";
import { WatchMonitor } from "@/components/WatchMonitor";
import type { Departure } from "@/lib/departures";
import type { Watch } from "@/lib/watches";
import {
  materialWatchChanges,
  pollWatchedStations,
  shouldSendBrowserNotification,
  watchChangeMessage,
} from "@/lib/watchMonitor";
import { watchDeparture } from "@/lib/watches";

const departure: Departure = {
  id: "1234-2024-05-30T15:00:00.000Z",
  destination: "Trenton",
  scheduledTime: "2024-05-30T15:00:00.000Z",
  expectedTime: "2024-05-30T15:05:00.000Z",
  trainNumber: "1234",
  line: "Northeast Corridor Line",
  lineCode: "NE",
  track: "5",
  status: "delayed",
  statusText: "5 Min Late",
  delayMinutes: 5,
};

function watch(stationCode = "NY"): Watch {
  return { ...departure, stationCode };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("Client watcher behavior", () => {
  it("identifies every cancellation, track, and expected-time change of at least two minutes", () => {
    expect(materialWatchChanges([watch()], "NY", [{
      ...departure,
      expectedTime: "2024-05-30T15:06:59.000Z",
    }])).toEqual([]);

    expect(materialWatchChanges([watch()], "NY", [{
      ...departure,
      expectedTime: "2024-05-30T15:07:00.000Z",
    }])).toMatchObject([{ kind: "expected-time" }]);
    expect(materialWatchChanges([{ ...watch(), track: "" }], "NY", [departure]))
      .toMatchObject([{ kind: "track" }]);
    expect(materialWatchChanges([watch()], "NY", [{ ...departure, status: "cancelled" }]))
      .toMatchObject([{ kind: "cancelled" }]);

    expect(materialWatchChanges([watch()], "NY", [{
      ...departure,
      status: "cancelled",
      track: "6",
      expectedTime: "2024-05-30T15:07:00.000Z",
    }]).map((change) => change.kind)).toEqual(["cancelled", "track", "expected-time"]);
    const [withdrawnTrack] = materialWatchChanges([watch()], "NY", [{ ...departure, track: "" }]);
    expect(withdrawnTrack).toMatchObject({ kind: "track" });
    expect(watchChangeMessage(withdrawnTrack!)).toContain("track assignment was removed");
  });

  it("polls every watched station even when the tab is backgrounded", async () => {
    const fetchStation = vi.fn(async (stationCode: string) => ({
      stationCode,
      departures: [departure],
      live: true,
    }));

    await pollWatchedStations([watch("NY"), watch("NWK")], fetchStation);

    expect(fetchStation).toHaveBeenCalledTimes(2);
    expect(fetchStation).toHaveBeenCalledWith("NY");
    expect(fetchStation).toHaveBeenCalledWith("NWK");
  });

  it("uses browser notifications only for background tabs with granted permission", () => {
    expect(shouldSendBrowserNotification("visible", "granted")).toBe(false);
    expect(shouldSendBrowserNotification("hidden", "default")).toBe(false);
    expect(shouldSendBrowserNotification("hidden", "denied")).toBe(false);
    expect(shouldSendBrowserNotification("hidden", "granted")).toBe(true);
  });

  it("keeps an accessible in-page Watch alert when notification permission is denied", async () => {
    const notification = vi.fn();
    Object.assign(notification, { permission: "denied" });
    vi.stubGlobal("Notification", notification);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      departures: [{ ...departure, expectedTime: "2024-05-30T15:07:00.000Z" }],
      fixtures: false,
    })))));

    render(<WatchMonitor />);
    watchDeparture("NY", departure);

    expect((await screen.findByRole("alert")).textContent).toContain("now departs");
    expect(notification).not.toHaveBeenCalled();
  });

  it("falls back to an in-page Watch alert when a granted page notification throws", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const notification = vi.fn(() => {
      throw new Error("Use the service worker notification API");
    });
    Object.assign(notification, { permission: "granted" });
    vi.stubGlobal("Notification", notification);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      departures: [{ ...departure, expectedTime: "2024-05-30T15:07:00.000Z" }],
      fixtures: false,
    }))));

    render(<WatchMonitor />);
    watchDeparture("NY", departure);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(notification).toHaveBeenCalledOnce();
  });

  it("uses the selected 24-hour clock format in Watch messages", () => {
    const [change] = materialWatchChanges([watch()], "NY", [{
      ...departure,
      expectedTime: "2024-05-30T19:07:00.000Z",
    }]);

    expect(watchChangeMessage(change!, { use24Hour: true })).toContain("15:07");
  });

  it("explains and requests notification permission with the first Watch action", () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const notification = vi.fn();
    Object.assign(notification, { permission: "default", requestPermission });
    vi.stubGlobal("Notification", notification);

    render(<DepartureRow departure={departure} now={Date.parse(departure.expectedTime)} stationCode="NY" />);
    fireEvent.click(screen.getByRole("button", { name: "Watch train 1234 to Trenton" }));

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("Watch alerts");
  });
});
