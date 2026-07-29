import { afterEach, describe, expect, it } from "vitest";
import type { Departure } from "@/lib/departures";
import {
  reconcileStationWatches,
  unwatchDeparture,
  watchDeparture,
  watchedDepartures,
} from "@/lib/watches";

const departure: Departure = {
  id: "1234-2024-05-30T15:00:00.000Z",
  destination: "Trenton",
  scheduledTime: "2024-05-30T15:00:00.000Z",
  expectedTime: "2024-05-30T15:05:00.000Z",
  trainNumber: "1234",
  line: "Northeast Corridor Line",
  lineCode: "NE",
  track: "5",
  status: "delayed",
  statusText: "5 Min Late",
  delayMinutes: 5,
};

afterEach(() => {
  window.localStorage.clear();
});

describe("Watch registry", () => {
  it("persists exact Watch keys across stations and daily reuse of a train number", () => {
    watchDeparture("NY", departure);
    watchDeparture("NWK", departure);
    watchDeparture("NY", {
      ...departure,
      id: "1234-2024-05-31T15:00:00.000Z",
      scheduledTime: "2024-05-31T15:00:00.000Z",
    });
    watchDeparture("NY", departure);

    expect(watchedDepartures()).toEqual([
      expect.objectContaining({ stationCode: "NY", trainNumber: "1234", scheduledTime: "2024-05-30T15:00:00.000Z" }),
      expect.objectContaining({ stationCode: "NWK", trainNumber: "1234", scheduledTime: "2024-05-30T15:00:00.000Z" }),
      expect.objectContaining({ stationCode: "NY", trainNumber: "1234", scheduledTime: "2024-05-31T15:00:00.000Z" }),
    ]);
  });

  it("only completes a Watch after a live station response no longer contains its exact key", () => {
    watchDeparture("NY", departure);

    reconcileStationWatches("NY", [], { live: false });
    expect(watchedDepartures()).toHaveLength(1);

    reconcileStationWatches("NY", [{ ...departure, expectedTime: "2024-05-30T15:09:00.000Z" }], { live: true });
    expect(watchedDepartures()[0]?.expectedTime).toBe("2024-05-30T15:09:00.000Z");

    reconcileStationWatches("NY", [], { live: true });
    expect(watchedDepartures()).toEqual([]);
  });

  it("unwatches only the selected exact departure", () => {
    watchDeparture("NY", departure);
    watchDeparture("NY", {
      ...departure,
      id: "1234-2024-05-31T15:00:00.000Z",
      scheduledTime: "2024-05-31T15:00:00.000Z",
    });

    unwatchDeparture({
      stationCode: "NY",
      trainNumber: "1234",
      scheduledTime: "2024-05-30T15:00:00.000Z",
    });

    expect(watchedDepartures()).toEqual([
      expect.objectContaining({ scheduledTime: "2024-05-31T15:00:00.000Z" }),
    ]);
  });
});
