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
  it("keeps a disruption visible, summarizes multiple advisories, and gives every notice its official link and exact dismissal", async () => {
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

    expect((await screen.findByRole("alert")).textContent).toContain(disruption.text);
    expect(screen.getByRole("link", { name: /northeast corridor line service/i }).getAttribute("href")).toBe(disruption.url);
    expect(screen.getByText("Service status — 2 advisories")).toBeTruthy();
    expect((screen.getByText(firstAdvisory.text).closest("details") as HTMLDetailsElement).open).toBe(false);

    fireEvent.click(screen.getByText("Service status — 2 advisories"));
    expect(await screen.findByText(firstAdvisory.text)).toBeTruthy();
    expect(screen.getByRole("link", { name: /new york penn station staircase/i }).getAttribute("href")).toBe(firstAdvisory.url);

    fireEvent.click(screen.getByRole("button", { name: `Dismiss service notice: ${disruption.text}` }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText(firstAdvisory.text)).toBeTruthy();
  });
});
