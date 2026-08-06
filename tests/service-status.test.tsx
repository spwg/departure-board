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
  it("collapses every notice into one counted summary line with official links and exact dismissal", async () => {
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
    const { container } = render(<ServiceStatus stationCode="NY" />);

    // A current disruption gets no line of its own, however it is marked: one
    // summary states the counts, and nothing is readable until it is opened.
    const summary = await screen.findByText("Service status — 1 disruption, 2 advisories");
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(false);

    fireEvent.click(summary);
    expect(await screen.findByText(disruption.text)).toBeTruthy();
    expect(screen.getByRole("link", { name: /northeast corridor line service is suspended/i }).getAttribute("href")).toBe(disruption.url);
    expect(screen.getByRole("link", { name: /new york penn station staircase/i }).getAttribute("href")).toBe(firstAdvisory.url);

    // Dismissing one notice leaves the unrelated ones alone, and the summary
    // recounts what is left.
    fireEvent.click(screen.getByRole("button", { name: `Dismiss service notice: ${disruption.text}` }));
    await waitFor(() => expect(screen.queryByText(disruption.text)).toBeNull());
    expect(screen.getByText("Service status — 2 advisories")).toBeTruthy();
    expect(screen.getByText(firstAdvisory.text)).toBeTruthy();
    expect(screen.getByText(secondAdvisory.text)).toBeTruthy();
  });

  it("brings a dismissed notice back once its transit system materially changes it", async () => {
    window.localStorage.setItem(
      "departure-board:dismissed-service-banners",
      JSON.stringify({ [disruption.id]: disruption.revision }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        advisories: [{ ...disruption, revision: "reworded", text: "Northeast Corridor Line service has resumed with delays." }],
        authoritativeRevisions: { [disruption.id]: "reworded" },
      })),
    ));

    render(<ServiceStatus stationCode="NY" />);

    expect(await screen.findByText("Service status — 1 disruption")).toBeTruthy();
  });
});
