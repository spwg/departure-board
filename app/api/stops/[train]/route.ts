import { revalidateTag } from "next/cache";
import { isExcludedTrainId } from "@/lib/departures";
import {
  InvalidTokenError,
  TOKEN_TAG,
  fetchStopList,
  invalidateToken,
  usingFixtures,
} from "@/lib/njtClient";
import { normalizeStopList, type StopList } from "@/lib/stops";

export type StopsResponse = {
  stopList: StopList;
  fetchedAt: string;
  /** True when serving stand-in data because no API credentials are set. */
  fixtures: boolean;
};

/**
 * Briefly shares a train's stops between everyone looking at it.
 *
 * A plain in-process map for the same reason the departures route uses one: an
 * error thrown inside a `use cache` function comes back wrapped by the Server
 * Components runtime, which would break the token-refresh branch below. The
 * TTL is longer than the board's because a stop list is mostly a fixed
 * sequence — only the estimates against it move.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; stopList: StopList }>();

async function getStopList(trainId: string): Promise<StopList> {
  const hit = cache.get(trainId);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.stopList;

  let raw;
  try {
    raw = await fetchStopList(trainId);
  } catch (error) {
    if (!(error instanceof InvalidTokenError)) throw error;
    // Same dance as the departures route: expire the dead token now rather
    // than serving it back, and retry once with a fresh one.
    await invalidateToken(error.token);
    revalidateTag(TOKEN_TAG, { expire: 0 });
    raw = await fetchStopList(trainId);
  }

  const stopList = normalizeStopList(raw);
  cache.set(trainId, { at: now, stopList });
  return stopList;
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/stops/[train]">,
) {
  const { train } = await context.params;
  const trainId = decodeURIComponent(train).trim();

  // Reached by URL rather than by tapping a row, so the board's filters have
  // to be applied again here — this app shows NJ Transit trains only.
  if (!trainId || isExcludedTrainId(trainId)) {
    return Response.json(
      { error: `Not an NJ Transit train: ${trainId}` },
      { status: 404 },
    );
  }

  let stopList: StopList;
  try {
    stopList = await getStopList(trainId);
  } catch (error) {
    console.error(`Stops for ${trainId} failed:`, error);
    return Response.json(
      { error: "Could not reach NJ Transit" },
      { status: 502 },
    );
  }

  const body: StopsResponse = {
    stopList,
    fetchedAt: new Date().toISOString(),
    fixtures: usingFixtures(),
  };

  return Response.json(body, {
    // The client polls on its own schedule; never let a browser or CDN serve
    // stale estimates.
    headers: { "Cache-Control": "no-store" },
  });
}
