import { NjtAuthError } from "./njtApi";
import { NjtCallBudgetError } from "./njtCallBudget";
import { TokenCooldownError, mintCooldownMs } from "./njtTokenStore";
import type { FailureBody } from "./loadFailure";

/**
 * The response for an NJ Transit call that failed after the token refresh.
 *
 * A refused or cooling-down sign-in is a 503 with Retry-After and
 * `kind: "paused"`: nothing will change until the cooldown ends, so the page
 * says when rather than offering to try again. Anything else — a timeout, an
 * NJ Transit outage, a malformed answer — is a 502, `kind: "upstream"`. An
 * instance over its call budget (lib/njtCallBudget) is a 503 with Retry-After,
 * still `kind: "upstream"`: it clears within seconds, so trying again helps.
 */
export function njtFailureResponse(error: unknown): Response {
  if (error instanceof NjtCallBudgetError) {
    const body: FailureBody = { error: "Too many NJ Transit requests; try again shortly", kind: "upstream" };
    return Response.json(body, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil((error.retryAt - Date.now()) / 1000))),
      },
    });
  }

  const retryAt =
    error instanceof TokenCooldownError
      ? error.retryAt
      : error instanceof NjtAuthError
        ? Date.now() + mintCooldownMs(error)
        : null;

  if (retryAt !== null) {
    const body: FailureBody = { error: "NJ Transit sign-in is paused", kind: "paused", retryAt };
    return Response.json(body, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))),
      },
    });
  }

  const body: FailureBody = { error: "Could not reach NJ Transit", kind: "upstream" };
  return Response.json(body, { status: 502, headers: { "Cache-Control": "no-store" } });
}
