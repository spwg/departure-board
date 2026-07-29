import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceStatus } from "@/components/ServiceStatus";
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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("service-status UI", () => {
  it("collapses disruptions and advisories into one summary, while preserving each notice's link and dismissal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        advisories: [disruption, firstAdvisory, secondAdvisory],
        authoritativeRevisions: {
          [disruption.id]: disruption.revision,
          [firstAdvisory.id]: firstAdvisory.revision,
          [secondAdvisory.id]: secondAdvisory.revision,
        },
      })),
    ));
    render(<ServiceStatus stationCode="NY" />);

    const summary = await screen.findByText(
      "Service status — 1 disruption, 2 advisories",
    );
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(await screen.findByText(disruption.text)).toBeTruthy();
    expect(screen.getByRole("link", { name: /northeast corridor line service/i }).getAttribute("href")).toBe(disruption.url);
    expect(await screen.findByText(firstAdvisory.text)).toBeTruthy();
    expect(screen.getByRole("link", { name: /new york penn station staircase/i }).getAttribute("href")).toBe(firstAdvisory.url);

    fireEvent.click(screen.getByRole("button", { name: `Dismiss service notice: ${disruption.text}` }));
    await waitFor(() => expect(screen.queryByText(disruption.text)).toBeNull());
    expect(screen.getByText(firstAdvisory.text)).toBeTruthy();
  });
});
