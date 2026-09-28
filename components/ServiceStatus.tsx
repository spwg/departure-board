"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  dismissServiceAdvisory,
  visibleServiceAdvisories,
} from "@/lib/serviceAdvisoryDismissals";
import type { ServiceAdvisory } from "@/lib/serviceAdvisories";
import { isSubwayRoute, subwayRouteColor } from "@/lib/subway";

const REFRESH_MS = 90_000;

type ServiceStatusResponse = {
  advisories: ServiceAdvisory[];
  authoritativeRevisions: Record<string, string>;
};

/**
 * The notice's link, only when it is an ordinary web address. The URL comes
 * from an upstream feed, so any other scheme (javascript:, data:) is dropped
 * and the notice shows as plain text.
 */
function webLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

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
  subwayRoute,
}: {
  stationCode?: string;
  lineCode?: string;
  subwayRoute?: string;
}) {
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams();
    let endpoint = "/api/service-advisories";
    if (stationCode) query.set("station", stationCode);
    else if (lineCode) query.append("line", lineCode);
    else if (subwayRoute) {
      endpoint = "/api/subway/alerts";
      query.set("route", subwayRoute);
    } else return;

    try {
      const response = await fetch(`${endpoint}?${query}`, {
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
  }, [lineCode, stationCode, subwayRoute]);

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

/** Which notices a status control covers: a station's, an NJ Transit line's, or a Subway route's. */
export type ServiceStatusScope =
  | { stationCode: string; lineCode?: never; subwayRoute?: never }
  | { lineCode: string; stationCode?: never; subwayRoute?: never }
  | { subwayRoute: string; stationCode?: never; lineCode?: never };

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
 * current disruptions first, then planned advisories, each linking to the
 * official original where there is one, and dismissible one by one.
 */
export function ServiceStatusList(scope: ServiceStatusScope) {
  const { failed, disruptions, advisories, dismiss } = useServiceStatus(scope);

  if (!disruptions || !advisories) {
    return (
      <p className="px-5 py-16 text-center text-muted">
        {failed
          ? `Couldn\u2019t reach ${scope.subwayRoute ? "MTA" : "NJ Transit"} service status. Try again shortly.`
          : "Loading service status…"}
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
        <NoticeGroup title="Disruptions" tone="danger" notices={disruptions} onDismiss={dismiss} subway={Boolean(scope.subwayRoute)} />
      )}
      {advisories.length > 0 && (
        <NoticeGroup title="Advisories" tone="warn" notices={advisories} onDismiss={dismiss} subway={Boolean(scope.subwayRoute)} />
      )}
    </>
  );
}

function NoticeGroup({
  title,
  tone,
  notices,
  onDismiss,
  subway,
}: {
  title: string;
  tone: "danger" | "warn";
  notices: ServiceAdvisory[];
  onDismiss: (notice: ServiceAdvisory) => void;
  subway: boolean;
}) {
  return (
    <section aria-label={title} className="border-b border-edge last:border-b-0">
      <h3 className={`px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider sm:px-5 ${tone === "danger" ? "text-danger" : "text-muted"}`}>
        {title}
      </h3>
      <div className="divide-y divide-edge">
        {notices.map((notice) => (
          <Notice key={notice.id} notice={notice} onDismiss={() => onDismiss(notice)} subway={subway} />
        ))}
      </div>
    </section>
  );
}

function Notice({
  notice,
  onDismiss,
  subway,
}: {
  notice: ServiceAdvisory;
  onDismiss: () => void;
  subway: boolean;
}) {
  const text = subway ? <WithRouteBullets text={notice.text} /> : notice.text;
  const href = webLink(notice.url);
  return (
    <article className="flex gap-3 px-4 py-3 text-sm sm:px-5">
      <div className="min-w-0 flex-1 leading-5">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {text}
            <span className="sr-only"> (official NJ TRANSIT notice)</span>
          </a>
        ) : (
          <p className="font-medium">{text}</p>
        )}
        {notice.details && (
          <details className="mt-1 text-muted">
            <summary className="cursor-pointer select-none text-xs font-medium">Details</summary>
            <p className="mt-1 whitespace-pre-line">
              {subway ? <WithRouteBullets text={notice.details} /> : notice.details}
            </p>
          </details>
        )}
      </div>
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

/**
 * MTA writes a route as its bullet in brackets, "[A]"; show it as the bullet
 * riders know from signage. Anything bracketed that is not a route stays text.
 */
function WithRouteBullets({ text }: { text: string }) {
  return text.split(/(\[[0-9A-Z]{1,3}\])/).map((part, index) => {
    const route = part.match(/^\[([0-9A-Z]{1,3})\]$/)?.[1];
    if (!route || !isSubwayRoute(route)) return part;
    return (
      <span
        key={index}
        role="img"
        aria-label={`${route} train`}
        className="mx-px inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center rounded-full px-0.5 align-middle text-[0.8em] font-bold leading-none text-white"
        style={{ backgroundColor: subwayRouteColor(route) }}
      >
        {route}
      </span>
    );
  });
}
