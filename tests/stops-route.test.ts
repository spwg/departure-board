import { afterEach, describe, expect, it, vi } from "vitest";

const fetchStopList = vi.fn();
class InvalidTokenError extends Error {}
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/njtClient", () => ({ fetchStopList, invalidateToken: vi.fn(), usingFixtures: () => true, InvalidTokenError, TOKEN_TAG: "njt-token" }));
vi.mock("@/lib/stops", () => ({ normalizeStopList: (raw: unknown) => raw }));
afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });
const context = (train: string) => ({ params: Promise.resolve({ train }) }) as never;

describe("stops route contract", () => {
  it("answers 404 without calling NJ Transit for ids that are not train numbers", async () => {
    const { GET } = await import("@/app/api/stops/[train]/route");
    for (const train of ["%", "A187", "not-a-train", "1".repeat(11)]) {
      expect((await GET(new Request("http://test"), context(train))).status).toBe(404);
    }
    expect(fetchStopList).not.toHaveBeenCalled();
  });

  it("shares a train's stops between requests", async () => {
    fetchStopList.mockResolvedValue({ TRAIN_ID: "3861", STOPS: [] });
    const { GET } = await import("@/app/api/stops/[train]/route");
    expect((await GET(new Request("http://test"), context("3861"))).status).toBe(200);
    expect((await GET(new Request("http://test"), context("3861"))).status).toBe(200);
    expect(fetchStopList).toHaveBeenCalledTimes(1);
  });

  it("keeps the cache bounded by evicting the least recently used train", async () => {
    fetchStopList.mockImplementation(async (id: string) => ({ TRAIN_ID: id, STOPS: [] }));
    const { GET } = await import("@/app/api/stops/[train]/route");
    for (let id = 1; id <= 500; id += 1) await GET(new Request("http://test"), context(String(id)));
    // A hit on the oldest train keeps it; the next train in line is evicted instead.
    await GET(new Request("http://test"), context("1"));
    await GET(new Request("http://test"), context("501"));
    fetchStopList.mockClear();
    await GET(new Request("http://test"), context("1"));
    await GET(new Request("http://test"), context("501"));
    expect(fetchStopList).not.toHaveBeenCalled();
    await GET(new Request("http://test"), context("2"));
    expect(fetchStopList).toHaveBeenCalledWith("2");
  });
});
