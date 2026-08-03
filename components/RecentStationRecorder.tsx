"use client";

import { useEffect } from "react";
import type { BoardChoice } from "@/lib/boardChoices";
import { recordRecentStation } from "@/lib/recentStations";

/** Adds the current station to local history after its board has opened. */
export function RecentStationRecorder({
  choice,
}: {
  choice: BoardChoice;
}) {
  useEffect(() => {
    recordRecentStation(choice);
  }, [choice]);

  return null;
}
