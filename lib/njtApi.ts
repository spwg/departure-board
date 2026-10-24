import type { RawDeparture } from "./departures";
import { njtEnvironment } from "./njtEnvironment";
import type { RawStopList } from "./stops";
import type { RawVehicle } from "./trainPositions";

/**
 * NJ Transit's RailData API, free of any framework: every call takes the token
 * explicitly, so both the Next.js app (lib/njtClient, which caches the token)
 * and the New York Penn collector Worker (collector/worker.ts) can use it.
 */

const UPSTREAM_TIMEOUT_MS = 10_000;

/** Thrown when NJT rejects the cached token, so the caller can refresh and retry. */
export class InvalidTokenError extends Error {
  declare readonly token: string;

  constructor(token: string) {
    super("NJT rejected the cached token");
    this.name = "InvalidTokenError";
    // Not enumerable, so logging the error never writes the token to the logs.
    Object.defineProperty(this, "token", { value: token });
  }
}

/**
 * NJ Transit answered getToken but refused: the daily limit, or credentials it
 * does not accept. Unlike a network failure, trying again soon will not help.
 */
export class NjtAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NjtAuthError";
  }
}

/** The host is NJT_ENV's backend (lib/njtEnvironment), which has no default. */
function baseUrl(): string {
  return njtEnvironment().baseUrl;
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
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
 * Mints a RailData token. NJT allows 10 a day, so callers never call this
 * directly but share one token through lib/njtTokenStore.
 */
export async function fetchToken(): Promise<string> {
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
      throw new NjtAuthError(
        `NJT authentication failed: ${error}. The token cache is not holding ` +
          `between requests — see the caching note in README.md.`,
      );
    }
    throw new NjtAuthError(`NJT authentication failed: ${error}`);
  }

  const token =
    payload && typeof payload === "object" && "UserToken" in payload
      ? String((payload as { UserToken: unknown }).UserToken ?? "")
      : "";

  if (!token) {
    // getToken answers with an empty body or Authenticated:"False" when the
    // account exists but is not provisioned for this API.
    throw new NjtAuthError(
      "NJT authentication failed: no token returned. Check that " +
        "NJT_API_USERNAME/NJT_API_PASSWORD are the API credentials emailed on " +
        "registration rather than a njtransit.com website login.",
    );
  }
  return token;
}

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
 * Raw departures for a station. Authentication, HTTP and invalid-token
 * responses throw; a rejected token throws InvalidTokenError so the caller can
 * replace it and retry.
 */
export async function requestDepartures(token: string, stationCode: string): Promise<RawDeparture[]> {
  const payload = await post("/TrainData/getTrainSchedule19Rec", {
    token,
    station: stationCode.toUpperCase(),
    line: "",
  });
  if (isInvalidToken(payload)) throw new InvalidTokenError(token);
  const error = errorMessageOf(payload);
  if (error) throw new Error(`NJT getTrainSchedule19Rec failed: ${error}`);
  return itemsOf(payload);
}

/**
 * The stops a train makes, by train number.
 *
 * A second call rather than a field on the board: the API manual is explicit
 * that getTrainSchedule19Rec returns DepartureVision's data "but without train
 * stop list information".
 */
export async function requestStopList(token: string, trainId: string): Promise<RawStopList> {
  const train = trainId.trim();
  const payload = await post("/TrainData/getTrainStopList", { token, train });
  if (isInvalidToken(payload)) throw new InvalidTokenError(token);
  const error = errorMessageOf(payload);
  if (error) throw new Error(`NJT getTrainStopList failed: ${error}`);
  // An unknown train number answers with an empty body rather than an error.
  if (!payload || typeof payload !== "object") {
    return { TRAIN_ID: train, LINECODE: "", DESTINATION: "", TRANSFERAT: "", STOPS: [] };
  }
  return payload as RawStopList;
}

/**
 * Position records for every active train: one call covers the whole system.
 * Its `ICS_TRACK_CKT` is the signal track circuit a train occupies, which is
 * how a train standing on a Penn platform can be placed before its track is
 * posted.
 */
export async function requestVehicles(token: string): Promise<RawVehicle[]> {
  const payload = await post("/TrainData/getVehicleData", { token });
  if (isInvalidToken(payload)) throw new InvalidTokenError(token);
  const error = errorMessageOf(payload);
  if (error) throw new Error(`NJT getVehicleData failed: ${error}`);
  // A list, even an empty one, is a real answer: no trains are running. An
  // empty body or anything else is a broken feed, and must not pass for one.
  if (!Array.isArray(payload)) throw new Error("NJT getVehicleData returned no vehicle list");
  return payload as RawVehicle[];
}
