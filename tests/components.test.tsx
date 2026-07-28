import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteButton } from "@/components/FavoriteButton";
import { DepartureBoard } from "@/components/DepartureBoard";
import { DepartureRow } from "@/components/DepartureRow";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import type { Departure } from "@/lib/departures";

const departure: Departure = { id: "1", destination: "Trenton", scheduledTime: "2024-05-30T15:00:00.000Z", expectedTime: "2024-05-30T15:05:00.000Z", trainNumber: "1234", line: "Northeast Corridor Line", lineCode: "NE", track: "5", status: "delayed", statusText: "5 Min Late", delayMinutes: 5 };

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("interactive component contract", () => {
  it("persists favourite choices and exposes the action through accessible state", async () => {
    render(<FavoriteButton code="NY" name="New York Penn Station" />);
    const button = screen.getByRole("button", { name: /add new york/i });
    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute("aria-pressed")).toBe("true"));
    expect(JSON.parse(window.localStorage.getItem("departure-board:favorites")!)).toEqual(["NY"]);
  });

  it("renders a delayed departure with its timetable, train, line, and track", () => {
    render(<DepartureRow departure={departure} now={Date.parse("2024-05-30T15:00:00.000Z")} />);
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
});
