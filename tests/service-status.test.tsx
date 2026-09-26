import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ServiceStatus,
  ServiceStatusButton,
  ServiceStatusList,
} from "@/components/ServiceStatus";
import type { ServiceAdvisory } from "@/lib/serviceAdvisories";

const disruption: ServiceAdvisory = {
  id: "current", revision: "current-revision", severity: "disruption",
  text: "Northeast Corridor Line service is suspended.",
  url: "https://www.njtransit.com/node/current", publishedAt: null,
};
const firstAdvisory: ServiceAdvisory = {
  id: "planned-1", revision: "planned-1-revision", severity: "advisory",
  text: "New York Penn Station staircase maintenance.",
  url: "https://www.njtransit.com/node/planned-1", publishedAt: null,
};
const secondAdvisory: ServiceAdvisory = {
  id: "planned-2", revision: "planned-2-revision", severity: "advisory",
  text: "Northeast Corridor Line track maintenance.",
  url: "https://www.njtransit.com/node/planned-2", publishedAt: null,
};

function stubFeed(advisories: ServiceAdvisory[]) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(
    new Response(JSON.stringify({
      advisories,
      authoritativeRevisions: Object.fromEntries(advisories.map((notice) => [notice.id, notice.revision])),
    })),
  )));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("station service-status page", () => {
  it("lists disruptions before advisories with official links and exact dismissal", async () => {
    stubFeed([firstAdvisory, disruption, secondAdvisory]);
    render(<ServiceStatusList stationCode="NY" />);

    const disruptions = await screen.findByRole("region", { name: "Disruptions" });
    const advisories = screen.getByRole("region", { name: "Advisories" });
    expect(disruptions.compareDocumentPosition(advisories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(disruptions).getByRole("link").getAttribute("href")).toBe(disruption.url);
    expect(within(advisories).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      firstAdvisory.url,
      secondAdvisory.url,
    ]);

    // Dismissing one notice leaves the unrelated ones alone.
    fireEvent.click(screen.getByRole("button", { name: `Dismiss service notice: ${disruption.text}` }));
    await waitFor(() => expect(screen.queryByText(disruption.text)).toBeNull());
    expect(screen.queryByRole("region", { name: "Disruptions" })).toBeNull();
    expect(screen.getByText(firstAdvisory.text)).toBeTruthy();
    expect(screen.getByText(secondAdvisory.text)).toBeTruthy();
  });

  it("says so when a station has no notices", async () => {
    stubFeed([]);
    render(<ServiceStatusList stationCode="NY" />);
    expect(await screen.findByText("No service notices for this station.")).toBeTruthy();
  });
});

describe("station service-status button", () => {
  it("links to the station's status page and flags only current disruptions", async () => {
    stubFeed([firstAdvisory, secondAdvisory]);
    const { container } = render(<ServiceStatusButton stationCode="NP" />);
    const button = screen.getByRole("link", { name: "Service status" });
    expect(button.getAttribute("href")).toBe("/station/NP/status");
    // Planned advisories are routine and never call for attention.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.querySelector("[data-testid=disruption-dot]")).toBeNull();

    cleanup();
    stubFeed([disruption, firstAdvisory]);
    const rendered = render(<ServiceStatusButton stationCode="NP" />);
    expect(await screen.findByRole("link", { name: "Service status: 1 disruption" })).toBeTruthy();
    expect(rendered.container.querySelector("[data-testid=disruption-dot]")).toBeTruthy();
  });

  it("drops the dot once the disruption is dismissed, and restores it when the notice changes", async () => {
    window.localStorage.setItem(
      "departure-board:dismissed-service-banners",
      JSON.stringify({ [disruption.id]: disruption.revision }),
    );
    stubFeed([disruption]);
    render(<ServiceStatusButton stationCode="NY" />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Service status" })).toBeTruthy();

    cleanup();
    stubFeed([{ ...disruption, revision: "reworded", text: "Northeast Corridor Line service has resumed with delays." }]);
    render(<ServiceStatusButton stationCode="NY" />);
    expect(await screen.findByRole("link", { name: "Service status: 1 disruption" })).toBeTruthy();
  });
});

describe("train service-status summary", () => {
  it("collapses a line's notices into one counted summary line", async () => {
    stubFeed([disruption, firstAdvisory, secondAdvisory]);
    const { container } = render(<ServiceStatus lineCode="NE" />);

    const summary = await screen.findByText("Service status — 1 disruption, 2 advisories");
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(summary);
    expect(screen.getByRole("link", { name: /service is suspended/i }).getAttribute("href")).toBe(disruption.url);
  });
});
