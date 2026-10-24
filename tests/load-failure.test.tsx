import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { NjtAuthError } from "@/lib/njtApi";
import { njtFailureResponse } from "@/lib/njtFailure";
import { REFUSED_MINT_COOLDOWN_MS, TokenCooldownError } from "@/lib/njtTokenStore";
import { LoadFailureError, failureFromError, failureFromResponse } from "@/lib/loadFailure";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const NOW = Date.parse("2026-10-24T16:00:00.000Z");

describe("NJ Transit failure responses", () => {
  it("answers a cooling-down sign-in with 503, Retry-After and when it resumes", async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const response = njtFailureResponse(new TokenCooldownError(NOW + 90_000));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(await response.json()).toEqual({ error: "NJ Transit sign-in is paused", kind: "paused", retryAt: NOW + 90_000 });
  });

  it("treats a refused sign-in as paused for the refusal cooldown", async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const response = njtFailureResponse(new NjtAuthError("NJT authentication failed: Daily usage limit"));
    expect(response.status).toBe(503);
    expect((await response.json()).retryAt).toBe(NOW + REFUSED_MINT_COOLDOWN_MS);
  });

  it("answers anything else with 502 upstream", async () => {
    const response = njtFailureResponse(new Error("NJT /TrainData/getTrainSchedule19Rec failed: 500"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Could not reach NJ Transit", kind: "upstream" });
  });
});

describe("Load failure classification", () => {
  it("reads the kind an API route reported, defaulting to upstream", async () => {
    expect(await failureFromResponse(Response.json({ error: "x", kind: "paused", retryAt: NOW }, { status: 503 }))).toEqual({ kind: "paused", retryAt: NOW });
    expect(await failureFromResponse(Response.json({ error: "Could not reach MTA" }, { status: 502 }))).toEqual({ kind: "upstream" });
    expect(await failureFromResponse(new Response("<html>", { status: 504 }))).toEqual({ kind: "upstream" });
  });

  it("tells an offline browser from a site that did not answer", () => {
    expect(failureFromError(new LoadFailureError({ kind: "upstream" }))).toEqual({ kind: "upstream" });
    vi.stubGlobal("navigator", { onLine: false });
    expect(failureFromError(new TypeError("Failed to fetch"))).toEqual({ kind: "offline" });
    vi.stubGlobal("navigator", { onLine: true });
    expect(failureFromError(new TypeError("Failed to fetch"))).toEqual({ kind: "network" });
  });
});

describe("LoadFailureNotice", () => {
  it("names the provider that failed and offers to try again", async () => {
    const onRetry = vi.fn();
    render(<LoadFailureNotice failure={{ kind: "upstream" }} provider="MTA" subject="departures" onRetry={onRetry} />);
    expect(screen.getByText("Couldn't reach MTA.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says when a paused sign-in resumes, with no button that could not help", () => {
    render(<LoadFailureNotice failure={{ kind: "paused", retryAt: NOW }} provider="NJ Transit" subject="departures" onRetry={() => {}} />);
    expect(screen.getByText("Live NJ Transit data is paused.")).toBeTruthy();
    expect(screen.getByText(/try again after 12:00/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tells an offline rider to reconnect", () => {
    render(<LoadFailureNotice failure={{ kind: "offline" }} provider="NJ Transit" subject="stops" onRetry={() => {}} />);
    expect(screen.getByText("You're offline.")).toBeTruthy();
    expect(screen.getByText("Connect to the internet to load live stops.")).toBeTruthy();
  });
});
