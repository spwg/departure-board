"use client";

import { formatClock } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import type { LoadFailure } from "@/lib/loadFailure";

/**
 * What a board, train page or stop list shows when its first load fails, one
 * message per known cause (lib/loadFailure). Every page keeps polling on its
 * own schedule behind this, so it clears by itself once the cause does.
 */
export function LoadFailureNotice({
  failure,
  provider,
  subject,
  onRetry,
}: {
  failure: LoadFailure;
  /** Whose live data the page shows. */
  provider: "NJ Transit" | "MTA";
  /** What failed to load, as in "Couldn't load departures." */
  subject: string;
  onRetry: () => void;
}) {
  const { use24Hour } = useClockFormat();

  let title: string;
  let detail: string;
  let canRetry = true;
  switch (failure.kind) {
    case "offline":
      title = "You're offline.";
      detail = `Connect to the internet to load live ${subject}.`;
      break;
    case "network":
      title = `Couldn't load ${subject}.`;
      detail = "This site didn't respond. Check your connection and try again.";
      break;
    case "upstream":
      title = `Couldn't reach ${provider}.`;
      detail = `${provider}'s live data may be down. This page checks again every 30 seconds.`;
      break;
    case "paused":
      title = "Live NJ Transit data is paused.";
      detail =
        "This site can't sign in to NJ Transit's data service right now. It will try again after " +
        `${formatClock(new Date(failure.retryAt).toISOString(), { hour12: !use24Hour })}.`;
      // Nothing changes before then, so there is nothing for a button to do.
      canRetry = false;
      break;
  }

  return (
    <div role="alert" className="px-5 py-16 text-center">
      <p className="font-medium text-text">{title}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      {canRetry && (
        <button
          type="button"
          className="mt-5 rounded-full border border-edge px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}
