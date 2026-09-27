"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isSubwayRoute, subwayRouteColor } from "@/lib/subway";
import { ServiceStatusButton } from "./ServiceStatus";

/** What the header shows for a Subway train, known once its trip loads. */
export type SubwayTrainIdentity = {
  route: string;
  destination: string;
  direction: string;
};

/** `undefined` while the trip loads; `null` once it is known not to have loaded. */
type Reported = SubwayTrainIdentity | null | undefined;

type SubwayTrain = {
  identity: Reported;
  setIdentity: (identity: Reported) => void;
};

const SubwayTrainContext = createContext<SubwayTrain | null>(null);

/**
 * Shares a Subway train's route and destination between the stop list that
 * loads them and the page header that shows them.
 */
export function SubwayTrainProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Reported>(undefined);
  return (
    <SubwayTrainContext.Provider value={{ identity, setIdentity }}>
      {children}
    </SubwayTrainContext.Provider>
  );
}

/** Reports the train's identity to the page header; a no-op outside a provider. */
export function useReportSubwayTrain(identity: Reported) {
  const setIdentity = useContext(SubwayTrainContext)?.setIdentity;
  const route = identity?.route;
  const destination = identity?.destination;
  const direction = identity?.direction;
  const loading = identity === undefined;
  useEffect(() => {
    setIdentity?.(
      route !== undefined && destination !== undefined && direction !== undefined
        ? { route, destination, direction }
        : loading ? undefined : null,
    );
  }, [route, destination, direction, loading, setIdentity]);
}

/**
 * The header's name for a Subway train, in MTA's terms: its route bullet and
 * destination. Subway trains carry no rider-facing number, and the internal
 * trip id that addresses one is never shown.
 */
export function SubwayTrainTitle() {
  const identity = useContext(SubwayTrainContext)?.identity;
  if (identity === undefined) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
        <h1 className="sr-only">Subway train</h1>
        <div aria-hidden className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-edge" />
        <div aria-hidden className="h-5 w-40 animate-pulse rounded bg-edge" />
      </div>
    );
  }
  if (identity === null) {
    return (
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-base font-semibold leading-6">Subway train</h1>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
      <span
        aria-label={`${identity.route} train`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base font-bold text-white"
        style={{ backgroundColor: subwayRouteColor(identity.route) }}
      >
        {identity.route}
      </span>
      <div className="min-w-0">
        <h1 className="text-base font-semibold leading-5">{identity.destination}</h1>
        <p className="text-sm leading-5 text-muted">{identity.direction}</p>
      </div>
    </div>
  );
}

/**
 * The Subway train page's way to its route's MTA alerts, as the NJ Transit
 * train page has one to its line's. It appears once the route is known.
 */
export function SubwayServiceStatusButton({ tripId }: { tripId: string }) {
  const route = useContext(SubwayTrainContext)?.identity?.route;
  if (!route || !isSubwayRoute(route)) return null;
  return (
    <ServiceStatusButton
      subwayRoute={route}
      href={`/subway/train/${encodeURIComponent(tripId)}/status?route=${encodeURIComponent(route)}`}
    />
  );
}
