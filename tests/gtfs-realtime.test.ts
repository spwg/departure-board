import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFeedMessage, feedFieldSpans } from "@/lib/gtfsRealtime";
import { encodeFeed } from "./gtfsRealtimeEncode";

const captured = new Uint8Array(readFileSync("tests/fixtures/mta-123.pb"));

/**
 * Inputs with the outcome protobuf.js 8.7.1 (gtfs-realtime-bindings 2.2.0)
 * gave for each: hand-written edge cases, a sample of differential fuzzing,
 * and the captured feeds. Regenerate with scripts/gtfs-realtime-parity.mts.
 */
type ParityCase = {
  name: string;
  input?: string;
  file?: string;
  expect: { ok: unknown } | { okSha256: string } | { error: { name: string; message: string } };
};
const parity: { cases: ParityCase[] } = JSON.parse(readFileSync("tests/fixtures/gtfs-realtime-parity.json", "utf8"));

function outcome(bytes: Uint8Array): ParityCase["expect"] {
  try {
    return { ok: decodeFeedMessage(bytes) };
  } catch (error) {
    return { error: { name: (error as Error).name, message: (error as Error).message } };
  }
}

describe("GTFS-Realtime decoder", () => {
  it.each(parity.cases.map((c) => [c.name, c]))("matches protobuf.js: %s", (_name, { input, file, expect: expected }) => {
    const bytes = file
      ? new Uint8Array(readFileSync(`tests/fixtures/${file}`))
      : new Uint8Array(Buffer.from(input!, "base64"));
    const actual = outcome(bytes);
    if ("okSha256" in expected) {
      expect(actual).toHaveProperty("ok");
      const json = JSON.stringify((actual as { ok: unknown }).ok);
      expect(createHash("sha256").update(json).digest("hex")).toBe(expected.okSha256);
    } else {
      expect(actual).toEqual(expected);
    }
  });

  it("reads the header timestamp, trips and stop times", () => {
    const feed = decodeFeedMessage(encodeFeed({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_786_000_000 },
      entity: [
        {
          id: "one",
          tripUpdate: {
            trip: { tripId: "trip-1", routeId: "1" },
            stopTimeUpdate: [
              { stopId: "128N", arrival: { time: 1_786_000_250 }, departure: { time: 1_786_000_300 } },
              { stopId: "101N", arrival: { time: 1_786_001_000 } },
            ],
          },
        },
        { id: "no-trip" },
      ],
    }));

    expect(feed).toEqual({
      header: { timestamp: 1_786_000_000 },
      entity: [
        {
          tripUpdate: {
            trip: { tripId: "trip-1", routeId: "1" },
            stopTimeUpdate: [
              { stopId: "128N", arrival: { time: 1_786_000_250 }, departure: { time: 1_786_000_300 } },
              { stopId: "101N", arrival: { time: 1_786_001_000 }, departure: null },
            ],
          },
        },
        { tripUpdate: null },
      ],
    });
  });

  it("gives absent fields protobuf's defaults", () => {
    const feed = decodeFeedMessage(encodeFeed({
      header: { gtfsRealtimeVersion: "2.0" },
      entity: [{ id: "bare", tripUpdate: { trip: {}, stopTimeUpdate: [{}] } }],
    }));
    expect(feed.header.timestamp).toBe(0);
    expect(feed.entity[0]!.tripUpdate).toEqual({
      trip: { tripId: "", routeId: "" },
      stopTimeUpdate: [{ stopId: "", arrival: null, departure: null }],
    });
  });

  it("decodes a captured MTA feed", () => {
    const feed = decodeFeedMessage(captured);
    expect(feed.header.timestamp).toBeGreaterThan(1_700_000_000);
    expect(feed.entity.length).toBe(45);
    expect(feed.entity.every((entity) => entity.tripUpdate?.trip.tripId)).toBe(true);
  });

  it("throws an Error, never reads past the end, on a feed cut short anywhere", () => {
    for (let length = 1; length < captured.length; length += 97) {
      try {
        decodeFeedMessage(captured.subarray(0, length));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
  });

  it("survives random bytes with an Error or a result, never anything else", () => {
    let seed = 1;
    const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 2_000; run += 1) {
      const bytes = Uint8Array.from({ length: Math.floor(random() * 64) }, () => Math.floor(random() * 256));
      try {
        decodeFeedMessage(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    }
  });

  it("splits a feed into top-level fields that rejoin byte for byte", () => {
    const spans = feedFieldSpans(captured);
    expect(spans[0]!.field).toBe(1);
    expect(spans.filter(({ field }) => field === 2)).toHaveLength(45);
    const rejoined = Uint8Array.from(spans.flatMap(({ start, end }) => [...captured.subarray(start, end)]));
    expect(rejoined).toEqual(captured);
    const [header, entity] = [spans[0]!, spans.find(({ field }) => field === 2)!];
    const single = Uint8Array.from([...captured.subarray(header.start, header.end), ...captured.subarray(entity.start, entity.end)]);
    expect(decodeFeedMessage(single).entity).toHaveLength(1);
  });
});
