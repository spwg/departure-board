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

/**
 * Compactly displays only official notices relevant to this board. The
 * separate, small client boundary keeps local dismissals out of server state.
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
  const hasDisruptions = disruptions.length > 0;
  const notices = [...disruptions, ...plannedAdvisories];

  const dismiss = (notice: ServiceAdvisory) => {
    dismissServiceAdvisory(notice);
    // Dismissals are local-only; preserve the fetched feed while rerendering.
    setStatus((current) => current
      ? { ...current, advisories: [...current.advisories] }
      : current);
  };

  return (
    <section aria-label="Service status" className="border-b border-edge">
      <details className={hasDisruptions ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}>
        <summary className="cursor-pointer px-4 py-2 text-sm font-semibold sm:px-5">
          {serviceStatusSummary(disruptions.length, plannedAdvisories.length)}
        </summary>
        <div className={hasDisruptions
          ? "divide-y divide-danger/20 border-t border-danger/20"
          : "divide-y divide-warn/20 border-t border-warn/20"}
        >
          {notices.map((notice) => (
            <Notice
              key={notice.id}
              notice={notice}
              disruption={notice.severity === "disruption"}
              onDismiss={() => dismiss(notice)}
            />
          ))}
        </div>
      </details>
    </section>
  );
}

function serviceStatusSummary(disruptionCount: number, advisoryCount: number) {
  const counts = [
    disruptionCount > 0 && `${disruptionCount} disruption${disruptionCount === 1 ? "" : "s"}`,
    advisoryCount > 0 && `${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"}`,
  ].filter(Boolean);

  return `Service status — ${counts.join(", ")}`;
}

function Notice({
  notice,
  disruption = false,
  onDismiss,
}: {
  notice: ServiceAdvisory;
  disruption?: boolean;
  onDismiss: () => void;
}) {
  return (
    <article
      className={`flex gap-3 px-4 py-3 text-sm sm:px-5 ${
        disruption ? "bg-danger-soft text-danger" : ""
      }`}
    >
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
