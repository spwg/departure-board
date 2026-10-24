import { describe, expect, it, vi } from "vitest";
import { createSharedLoader } from "@/lib/sharedLoader";

describe("shared upstream loader", () => {
  it("makes one call for concurrent misses and reuses it until it expires", async () => {
    let now = 0;
    let release!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const get = createSharedLoader(load, { ttlMs: 1_000, failureBackoffMs: 100, clock: () => now });

    const both = Promise.all([get(), get()]);
    release("first");
    expect(await both).toEqual(["first", "first"]);
    now = 999;
    expect(await get()).toBe("first");
    expect(load).toHaveBeenCalledTimes(1);

    now = 1_000;
    const next = get();
    release("second");
    expect(await next).toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("remembers a failure for the backoff, then tries again", async () => {
    let now = 0;
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("back");
    const get = createSharedLoader(load, { ttlMs: 1_000, failureBackoffMs: 100, clock: () => now });

    await expect(get()).rejects.toThrow("down");
    now = 99;
    await expect(get()).rejects.toThrow("down");
    expect(load).toHaveBeenCalledTimes(1);

    now = 100;
    expect(await get()).toBe("back");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
