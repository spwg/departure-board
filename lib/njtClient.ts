import "server-only";
import { unstable_cache } from "next/cache";
import type { RawDeparture } from "./departures";
import { fixtureDepartures, fixtureStopList } from "./fixtures";
import type { RawStopList } from "./stops";

/**
 * Client for NJ Transit's RailData API.
 *
 * Two constraints from NJT's API manual shape this file:
 *
 *  - getToken is capped at 10 calls per day. A module-level variable would not
 *    survive serverless cold starts, so the token is held in Next's durable
 *    Data Cache (`unstable_cache`) and refreshed on demand via the `njt-token`
 *    tag when the API reports it has gone bad.
 *  - Data calls are capped at 40,000 per day, comfortably above what 30-second
 *    polling needs once responses are briefly shared between clients.
 */

export const TOKEN_TAG = "njt-token";

/**
 * NJ Transit's developer portal documents raildata.njt.gov, but that name has
 * no A record yet — it is presumably staged for a move to the .gov domain.
 * njtransit.com is the host that actually serves traffic, and the one NJ
 * Transit's own DepartureVision site calls. Switch via NJT_API_BASE_URL once
 * the .gov host comes up.
 */
const DEFAULT_BASE_URL = "https://raildata.njtransit.com/api";

/** Thrown when NJT rejects the cached token, so the caller can refresh and retry. */
export class InvalidTokenError extends Error {
  constructor() {
    super("NJT rejected the cached token");
    this.name = "InvalidTokenError";
  }
}

/** True when no credentials are configured, in which case fixtures are served. */
export function usingFixtures(): boolean {
  return !process.env.NJT_API_USERNAME || !process.env.NJT_API_PASSWORD;
}

function baseUrl(): string {
  return process.env.NJT_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;
}

/** The API takes all parameters as multipart form fields, even the token. */
async function post(
  path: string,
  fields: Record<string, string>,
): Promise<unknown> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    body,
    headers: { accept: "application/json" },
    // This data is cached deliberately by the callers below; never by fetch.
    cache: "no-store",
  });

  if (!response.ok) {
    // An unusable account returns 500 with a JSON errorMessage, which is more
    // useful to surface than the status code alone.
    const detail = await response.text().catch(() => "");
    throw new Error(
      `NJT ${path} failed: ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`NJT ${path} returned a non-JSON response`);
  }
}

function errorMessageOf(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "errorMessage" in payload) {
    const message = (payload as { errorMessage: unknown }).errorMessage;
    return typeof message === "string" ? message : null;
  }
  return null;
}

/** Whether a response means the token needs replacing rather than the call failing. */
function isInvalidToken(payload: unknown): boolean {
  return /invalid token/i.test(errorMessageOf(payload) ?? "");
}

/**
 * Fetches a RailData token from NJ Transit.
 *
 * This function stays uncached so `getToken` below can store only successful
 * token values in the Data Cache.
 */
async function fetchToken(): Promise<string> {
  const payload = await post("/TrainData/getToken", {
    username: process.env.NJT_API_USERNAME ?? "",
    password: process.env.NJT_API_PASSWORD ?? "",
  });

  const error = errorMessageOf(payload);
  if (error) {
    // NJT allows 10 getToken calls a day. Hitting that means the token is not
    // being reused across requests, so say so rather than leaving a bare
    // "daily usage limit" to puzzle over.
    if (/daily usage limit/i.test(error)) {
      throw new Error(
        `NJT authentication failed: ${error}. The token cache is not holding ` +
          `between requests — see the caching note in README.md.`,
      );
    }
    throw new Error(`NJT authentication failed: ${error}`);
  }

  const token =
    payload && typeof payload === "object" && "UserToken" in payload
      ? String((payload as { UserToken: unknown }).UserToken ?? "")
      : "";

  if (!token) {
    // getToken answers with an empty body or Authenticated:"False" when the
    // account exists but is not provisioned for this API.
    throw new Error(
      "NJT authentication failed: no token returned. Check that " +
        "NJT_API_USERNAME/NJT_API_PASSWORD are the API credentials emailed on " +
        "registration rather than a njtransit.com website login.",
    );
  }
  return token;
}

/**
 * RailData token shared by all Vercel function instances and deployments.
 *
 * `use cache` is an in-memory cache in serverless runtimes, so a cold start
 * could otherwise mint another token. `unstable_cache` uses Next's Data Cache,
 * which is durable on Vercel. The route handler expires this tag immediately
 * and retries when NJT reports the token is invalid.
 */
const getToken = unstable_cache(fetchToken, ["njt-token"], {
  revalidate: 60 * 60 * 12,
  tags: [TOKEN_TAG],
});

function itemsOf(payload: unknown): RawDeparture[] {
  if (payload && typeof payload === "object" && "ITEMS" in payload) {
    const items = (payload as { ITEMS: unknown }).ITEMS;
    if (Array.isArray(items)) return items as RawDeparture[];
  }
  // A full-screen station alert replaces the schedule with an empty ITEMS list;
  // an empty board is the correct result, not an error.
  return [];
}

/**
 * Raw departures for a station, newest token first.
 *
 * Returns fixture data when credentials are absent so the app runs without
 * them. Callers normalize the result via lib/departures.
 */
export async function fetchDepartures(
  stationCode: string,
): Promise<RawDeparture[]> {
  if (usingFixtures()) return fixtureDepartures(stationCode);

  const station = stationCode.toUpperCase();
  const token = await getToken();
  const payload = await post("/TrainData/getTrainSchedule19Rec", {
    token,
    station,
    line: "",
  });

  if (isInvalidToken(payload)) {
    // Signal to the caller that the cached token should be dropped and the
    // request retried. Only route handlers may call revalidateTag, so the
    // invalidation itself happens there.
    throw new InvalidTokenError();
  }

  const error = errorMessageOf(payload);
  if (error) throw new Error(`NJT getTrainSchedule19Rec failed: ${error}`);

  return itemsOf(payload);
}

/**
 * The stops a train makes, by train number.
 *
 * A second call rather than a field on the board: the API manual is explicit
 * that getTrainSchedule19Rec returns DepartureVision's data "but without train
 * stop list information". This rides the same generous 40,000/day data limit
 * as the board, so asking for it per view is fine.
 */
export async function fetchStopList(trainId: string): Promise<RawStopList> {
  if (usingFixtures()) return fixtureStopList(trainId);

  const train = trainId.trim();
  const token = await getToken();
  const payload = await post("/TrainData/getTrainStopList", { token, train });

  if (isInvalidToken(payload)) throw new InvalidTokenError();

  const error = errorMessageOf(payload);
  if (error) throw new Error(`NJT getTrainStopList failed: ${error}`);

  // An unknown train number answers with an empty body rather than an error.
  if (!payload || typeof payload !== "object") {
    return {
      TRAIN_ID: train,
      LINECODE: "",
      DESTINATION: "",
      TRANSFERAT: "",
      STOPS: [],
    };
  }

  return payload as RawStopList;
}
