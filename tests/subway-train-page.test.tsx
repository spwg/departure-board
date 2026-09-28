import { describe, expect, it } from "vitest";
import SubwayTrainPage from "@/app/subway/train/[id]/page";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Subway train page params", () => {
  it("renders a trip id that arrives percent-encoded", async () => {
    // Test the page component itself, not status or title: under partial prerendering a notFound() streams inside a 200, and only generateMetadata gets decoded params.
    const page = await SubwayTrainPage(params("mta%3Aace%3A141000_A..N02X001%3AA24"));
    expect(JSON.stringify(page)).toContain('"tripId":"mta:ace:141000_A..N02X001:A24"');
  });

  it("still turns away an id that is not a trip", async () => {
    await expect(SubwayTrainPage(params("not-a-trip"))).rejects.toThrow();
  });
});
