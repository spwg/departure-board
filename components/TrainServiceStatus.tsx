"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ServiceStatusButton } from "./ServiceStatus";

type TrainLine = {
  lineCode: string | null;
  setLineCode: (lineCode: string | null) => void;
};

const TrainLineContext = createContext<TrainLine | null>(null);

/**
 * Shares a train's line, known only once its stops load, between the stop
 * list that learns it and the header control that needs it.
 */
export function TrainLineProvider({ children }: { children: React.ReactNode }) {
  const [lineCode, setLineCode] = useState<string | null>(null);
  return (
    <TrainLineContext.Provider value={{ lineCode, setLineCode }}>
      {children}
    </TrainLineContext.Provider>
  );
}

/** Reports the train's line to the page's header; a no-op outside a provider. */
export function useReportTrainLine(lineCode: string | null) {
  const setLineCode = useContext(TrainLineContext)?.setLineCode;
  useEffect(() => {
    setLineCode?.(lineCode);
  }, [lineCode, setLineCode]);
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
