"use client";

import Link from "next/link";
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

/** "1 disruption", "2 disruptions". */
function disruptionCount(count: number): string {
  return `${count} ${count === 1 ? "disruption" : "disruptions"}`;
}

/**
 * The official notices relevant to one station or line, minus any the rider
 * dismissed, refreshed while the page is visible. Null until the first load,
 * and stays null if the feed cannot be reached: advisories add context but
 * must never stand in the way of departures.
 *
 * The separate, small client boundary keeps local dismissals out of server
 * state.
 */
export function useServiceStatus({
  stationCode,
  lineCode,
}: {
  stationCode?: string;
  lineCode?: string;
}) {
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

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
      setFailed(false);
    } catch (error) {
      if (!signal?.aborted) {
        console.error("Could not load service status:", error);
        setFailed(true);
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

  const visible = status
    ? visibleServiceAdvisories(status.advisories, status.authoritativeRevisions)
    : null;

  const dismiss = (notice: ServiceAdvisory) => {
    dismissServiceAdvisory(notice);
    // Dismissals are local-only; preserve the fetched feed while rerendering.
    setStatus((current) => current
      ? { ...current, advisories: [...current.advisories] }
      : current);
  };

  return {
    failed,
    disruptions: visible?.filter((notice) => notice.severity === "disruption") ?? null,
    advisories: visible?.filter((notice) => notice.severity === "advisory") ?? null,
    dismiss,
  };
}

/** Which notices a status control covers: a station's, or one line's. */
export type ServiceStatusScope =
  | { stationCode: string; lineCode?: never }
  | { lineCode: string; stationCode?: never };

/**
 * A station's or train's way to its service-status page. Planned advisories
 * are routine and never call for attention here; only a current disruption
 * earns the red dot, and dismissing it clears the dot.
 */
export function ServiceStatusButton({ href, ...scope }: ServiceStatusScope & { href: string }) {
  const { disruptions } = useServiceStatus(scope);
  const disrupted = (disruptions?.length ?? 0) > 0;
  const label = disrupted
    ? `Service status: ${disruptionCount(disruptions!.length)}`
    : "Service status";

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      {/* A megaphone: official announcements, not an alarm. */}
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
      {disrupted && (
        <span
          aria-hidden
          data-testid="disruption-dot"
          className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger"
        />
      )}
    </Link>
  );
}

/**
 * Every official notice for one station or line, on a page of its own:
 * current disruptions first, then planned advisories, each linking to
 * NJ TRANSIT's original and dismissible one by one.
 */
export function ServiceStatusList(scope: ServiceStatusScope) {
  const { failed, disruptions, advisories, dismiss } = useServiceStatus(scope);

  if (!disruptions || !advisories) {
    return (
      <p className="px-5 py-16 text-center text-muted">
        {failed ? "Couldn\u2019t reach NJ Transit service status. Try again shortly." : "Loading service status…"}
      </p>
    );
  }
  if (disruptions.length + advisories.length === 0) {
    return (
      <p className="px-5 py-16 text-center text-muted">
        No service notices for this {scope.stationCode ? "station" : "line"}.
      </p>
    );
  }

  return (
    <>
      {disruptions.length > 0 && (
        <NoticeGroup title="Disruptions" tone="danger" notices={disruptions} onDismiss={dismiss} />
      )}
      {advisories.length > 0 && (
        <NoticeGroup title="Advisories" tone="warn" notices={advisories} onDismiss={dismiss} />
      )}
    </>
  );
}

function NoticeGroup({
  title,
  tone,
  notices,
  onDismiss,
}: {
  title: string;
  tone: "danger" | "warn";
  notices: ServiceAdvisory[];
  onDismiss: (notice: ServiceAdvisory) => void;
}) {
  return (
    <section aria-label={title} className="border-b border-edge last:border-b-0">
      <h3 className={`px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider sm:px-5 ${tone === "danger" ? "text-danger" : "text-muted"}`}>
        {title}
      </h3>
      <div className="divide-y divide-edge">
        {notices.map((notice) => (
          <Notice key={notice.id} notice={notice} onDismiss={() => onDismiss(notice)} />
        ))}
      </div>
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
