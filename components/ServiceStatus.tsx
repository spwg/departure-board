"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dismissServiceAdvisory,
  visibleServiceAdvisories,
} from "@/lib/serviceAdvisoryDismissals";
import type { ServiceAdvisory } from "@/lib/serviceAdvisories";

const REFRESH_MS = 90_000;

type ServiceStatusResponse = {
  advisories: ServiceAdvisory[];
  authoritativeRevisions: Record<string, string>;
};

/** "1 disruption, 2 advisories" — what the rider judges before opening. */
function counts(disruptions: number, advisories: number): string {
  const parts: string[] = [];
  if (disruptions > 0) {
    parts.push(`${disruptions} ${disruptions === 1 ? "disruption" : "disruptions"}`);
  }
  if (advisories > 0) {
    parts.push(`${advisories} ${advisories === 1 ? "advisory" : "advisories"}`);
  }
  return parts.join(", ");
}

/**
 * The one line official notices get above a board, however many there are and
 * whatever they are marked.
 *
 * A provider marks whether a notice is current, not whether it matters — the
 * same flag covers a full suspension and one train running late — so nothing
 * here decides placement by severity. Three stacked banners used to eat a third
 * of a phone screen before the first departure; now the counts sit on one line
 * and the notices themselves are one tap away.
 *
 * The separate, small client boundary keeps local dismissals out of server
 * state.
 */
export function ServiceStatus({
  stationCode,
  lineCode,
}: {
  stationCode?: string;
  lineCode?: string;
}) {
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (stationCode) query.set("station", stationCode);
    else if (lineCode) query.append("line", lineCode);
    else return;

    try {
      const response = await fetch(`/api/service-advisories?${query}`, {
        signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      const data: ServiceStatusResponse = await response.json();
      setStatus(data);
    } catch (error) {
      if (!signal?.aborted) {
        // Advisories add context, but should never replace the departure board.
        console.error("Could not load service status:", error);
      }
    }
  }, [lineCode, stationCode]);

  useEffect(() => {
    const controller = new AbortController();
    // The update follows an await and is intentionally isolated from render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(poll);
    };
  }, [load]);

  if (!status) return null;
  const visible = visibleServiceAdvisories(
    status.advisories,
    status.authoritativeRevisions,
  );
  const disruptions = visible.filter((notice) => notice.severity === "disruption");
  const plannedAdvisories = visible.filter((notice) => notice.severity === "advisory");
  if (visible.length === 0) return null;

  const dismiss = (notice: ServiceAdvisory) => {
    dismissServiceAdvisory(notice);
    // Dismissals are local-only; preserve the fetched feed while rerendering.
    setStatus((current) => current
      ? { ...current, advisories: [...current.advisories] }
      : current);
  };

  // A current notice is styled inside the summary rather than lifted out of it.
  const urgent = disruptions.length > 0;
  return (
    <section aria-label="Service status" className="border-b border-edge">
      <details className={urgent ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}>
        <summary className="cursor-pointer px-4 py-2 text-sm font-semibold sm:px-5">
          Service status — {counts(disruptions.length, plannedAdvisories.length)}
        </summary>
        <div className={`divide-y border-t ${urgent ? "divide-danger/20 border-danger/20" : "divide-warn/20 border-warn/20"}`}>
          {[...disruptions, ...plannedAdvisories].map((notice) => (
            <Notice
              key={notice.id}
              notice={notice}
              onDismiss={() => dismiss(notice)}
            />
          ))}
        </div>
      </details>
    </section>
  );
}

function Notice({
  notice,
  onDismiss,
}: {
  notice: ServiceAdvisory;
  onDismiss: () => void;
}) {
  return (
    <article className="flex gap-3 px-4 py-3 text-sm sm:px-5">
      <p className="min-w-0 flex-1 leading-5">
        <a
          href={notice.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {notice.text}
          <span className="sr-only"> (official NJ TRANSIT notice)</span>
        </a>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss service notice: ${notice.text}`}
        className="shrink-0 self-start rounded p-1 leading-none hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <span aria-hidden>×</span>
      </button>
    </article>
  );
}
