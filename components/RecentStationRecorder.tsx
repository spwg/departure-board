"use client";

import { useEffect } from "react";
import { recordRecentStation } from "@/lib/recentStations";

/** Adds the current station to local history after its board has opened. */
export function RecentStationRecorder({ code }: { code: string }) {
  useEffect(() => {
    recordRecentStation(code);
  }, [code]);

  return null;
}
