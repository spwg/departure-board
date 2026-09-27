"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { lineColor, lineName } from "@/lib/stations";
import { ServiceStatusButton } from "./ServiceStatus";

type TrainRoute = { lineCode: string | null; destination: string | null };

type TrainLine = TrainRoute & {
  setRoute: (route: TrainRoute) => void;
};

const TrainLineContext = createContext<TrainLine | null>(null);

/**
 * Shares a train's line and destination, known only once its stops load,
 * between the stop list that learns them and the header that shows them.
 */
export function TrainLineProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<TrainRoute>({ lineCode: null, destination: null });
  return (
    <TrainLineContext.Provider value={{ ...route, setRoute }}>
      {children}
    </TrainLineContext.Provider>
  );
}

/** Reports the train's route to the page's header; a no-op outside a provider. */
export function useReportTrainLine(lineCode: string | null, destination: string | null = null) {
  const setRoute = useContext(TrainLineContext)?.setRoute;
  useEffect(() => {
    setRoute?.({ lineCode, destination });
  }, [lineCode, destination, setRoute]);
}

/**
 * The header's name for the train: its number, then its line and destination
 * once the stops have loaded. The number is known from the URL, so the page is
 * named from the first paint.
 */
export function TrainTitle({ train }: { train: string }) {
  const route = useContext(TrainLineContext);
  const lineCode = route?.lineCode;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
      {lineCode && (
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: lineColor(lineCode) }}
        />
      )}
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-6">Train {train}</h1>
        {lineCode && (
          <p className="truncate text-sm text-muted">
            {lineName(lineCode)}
            {route.destination ? ` · to ${route.destination}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The train page's way to its line's service-status page, as a station board
 * has one to the station's. It appears once the train's line is known.
 */
export function TrainServiceStatusButton({ train, from }: { train: string; from: string }) {
  const lineCode = useContext(TrainLineContext)?.lineCode;
  if (!lineCode) return null;

  const query = new URLSearchParams({ line: lineCode });
  if (from) query.set("from", from);
  return (
    <ServiceStatusButton
      lineCode={lineCode}
      href={`/train/${encodeURIComponent(train)}/status?${query}`}
    />
  );
}
