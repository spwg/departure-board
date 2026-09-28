import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceStatusButton, ServiceStatusList } from "@/components/ServiceStatus";
import {
  TrainLineProvider,
  TrainServiceStatusButton,
  TrainTitle,
  useReportTrainLine,
} from "@/components/TrainServiceStatus";
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

  it("shows a notice whose feed link is not a web address as plain text", async () => {
    stubFeed([{ ...firstAdvisory, url: "javascript:alert(1)" }]);
    render(<ServiceStatusList stationCode="NY" />);
    expect(await screen.findByText(firstAdvisory.text)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
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
    const { container } = render(<ServiceStatusButton stationCode="NP" href="/station/NP/status" />);
    const button = screen.getByRole("link", { name: "Service status" });
    expect(button.getAttribute("href")).toBe("/station/NP/status");
    // Planned advisories are routine and never call for attention.
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.querySelector("[data-testid=disruption-dot]")).toBeNull();

    cleanup();
    stubFeed([disruption, firstAdvisory]);
    const rendered = render(<ServiceStatusButton stationCode="NP" href="/station/NP/status" />);
    expect(await screen.findByRole("link", { name: "Service status: 1 disruption" })).toBeTruthy();
    expect(rendered.container.querySelector("[data-testid=disruption-dot]")).toBeTruthy();
  });

  it("drops the dot once the disruption is dismissed, and restores it when the notice changes", async () => {
    window.localStorage.setItem(
      "departure-board:dismissed-service-banners",
      JSON.stringify({ [disruption.id]: disruption.revision }),
    );
    stubFeed([disruption]);
    render(<ServiceStatusButton stationCode="NY" href="/station/NY/status" />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Service status" })).toBeTruthy();

    cleanup();
    stubFeed([{ ...disruption, revision: "reworded", text: "Northeast Corridor Line service has resumed with delays." }]);
    render(<ServiceStatusButton stationCode="NY" href="/station/NY/status" />);
    expect(await screen.findByRole("link", { name: "Service status: 1 disruption" })).toBeTruthy();
  });
});

function ReportLine({ lineCode, destination = null }: { lineCode: string | null; destination?: string | null }) {
  useReportTrainLine(lineCode, destination);
  return null;
}

describe("train title", () => {
  it("names the train from the start and adds its line and destination once known", () => {
    const { rerender } = render(
      <TrainLineProvider>
        <TrainTitle train="6931" />
        <ReportLine lineCode={null} />
      </TrainLineProvider>,
    );
    expect(screen.getByRole("heading", { name: "Train 6931" })).toBeTruthy();
    expect(screen.queryByText(/Line/)).toBeNull();

    rerender(
      <TrainLineProvider>
        <TrainTitle train="6931" />
        <ReportLine lineCode="ME" destination="Dover" />
      </TrainLineProvider>,
    );
    expect(screen.getByText("Morris & Essex Line · to Dover")).toBeTruthy();
  });
});

describe("train service status", () => {
  it("links the train header to its line's status page once the line is known", async () => {
    stubFeed([disruption]);
    const { rerender } = render(
      <TrainLineProvider>
        <TrainServiceStatusButton train="7245" from="NY" />
        <ReportLine lineCode={null} />
      </TrainLineProvider>,
    );
    // No line yet, so nothing to link to and nothing fetched.
    expect(screen.queryByRole("link")).toBeNull();

    rerender(
      <TrainLineProvider>
        <TrainServiceStatusButton train="7245" from="NY" />
        <ReportLine lineCode="NC" />
      </TrainLineProvider>,
    );
    const button = await screen.findByRole("link", { name: "Service status: 1 disruption" });
    expect(button.getAttribute("href")).toBe("/train/7245/status?line=NC&from=NY");
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain("line=NC");
  });

  it("lists a line's notices on the train's status page", async () => {
    stubFeed([firstAdvisory]);
    render(<ServiceStatusList lineCode="NE" />);
    expect(await screen.findByRole("region", { name: "Advisories" })).toBeTruthy();

    cleanup();
    stubFeed([]);
    render(<ServiceStatusList lineCode="NE" />);
    expect(await screen.findByText("No service notices for this line.")).toBeTruthy();
  });
});

describe("subway service status", () => {
  it("lists MTA alerts as plain text with route bullets and fetches by route", async () => {
    stubFeed([{
      id: "lmm:alert:1", revision: "r1", severity: "disruption", publishedAt: null,
      text: "[FS] trains are running with delays.", details: "Take the [B] or [Q] instead.",
    }]);
    render(<ServiceStatusList subwayRoute="FS" />);

    const region = await screen.findByRole("region", { name: "Disruptions" });
    expect(within(region).queryByRole("link")).toBeNull();
    expect(within(region).getByRole("img", { name: "FS train" })).toBeTruthy();
    expect(within(region).getByRole("img", { name: "Q train" })).toBeTruthy();
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe("/api/subway/alerts?route=FS");
  });
});
