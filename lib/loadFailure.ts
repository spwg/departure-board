/**
 * Why a board, train page or stop list could not load, as the browser can
 * tell. The API routes say which upstream failure it was (`kind` in the JSON
 * body); a fetch that never got an answer is the rider's connection or this
 * site.
 *
 *  - offline: the browser reports no connection at all.
 *  - network: the browser is online, but this site did not answer.
 *  - upstream: this site answered, but NJ Transit or the MTA did not.
 *  - paused: this site cannot sign in to NJ Transit until `retryAt`, after a
 *    failed attempt (lib/njtTokenStore's cooldown). Trying sooner cannot help.
 */
export type LoadFailure =
  | { kind: "offline" }
  | { kind: "network" }
  | { kind: "upstream" }
  | { kind: "paused"; retryAt: number };

/** The JSON body of an API route's failure response. */
export type FailureBody = { error: string; kind?: "upstream" | "paused"; retryAt?: number };

/** Thrown by a loader for a response that was not ok, carrying what it said. */
export class LoadFailureError extends Error {
  constructor(readonly failure: LoadFailure) {
    super(`Load failed: ${failure.kind}`);
    this.name = "LoadFailureError";
  }
}

/** Reads a failed API response's kind, defaulting to an upstream failure. */
export async function failureFromResponse(response: Response): Promise<LoadFailure> {
  const body = (await response.json().catch(() => null)) as FailureBody | null;
  if (body?.kind === "paused" && typeof body.retryAt === "number") {
    return { kind: "paused", retryAt: body.retryAt };
  }
  return { kind: "upstream" };
}

/** What a caught loader error means for the rider. */
export function failureFromError(error: unknown): LoadFailure {
  if (error instanceof LoadFailureError) return error.failure;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
  return { kind: "network" };
}
