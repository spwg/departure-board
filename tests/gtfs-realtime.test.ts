import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFeedMessage, feedFieldSpans } from "@/lib/gtfsRealtime";
import { encodeFeed } from "./gtfsRealtimeEncode";

const captured = new Uint8Array(readFileSync("tests/fixtures/mta-123.pb"));

describe("GTFS-Realtime decoder", () => {
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

  it("skips fields it does not read, of every wire type, including extensions", () => {
    const known = encodeFeed({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 7 },
      entity: [{ id: "a", tripUpdate: { trip: { tripId: "t" }, stopTimeUpdate: [{ stopId: "S" }] } }],
    });
    const unknown = [
      0x18, 0x01, // field 3, varint
      0x21, 1, 2, 3, 4, 5, 6, 7, 8, // field 4, fixed64
      0x2d, 1, 2, 3, 4, // field 5, fixed32
      0xca, 0x3e, 0x02, 0x08, 0x01, // field 1001 (an NYCT extension), length-delimited
    ];
    const feed = decodeFeedMessage(Uint8Array.from([...known, ...unknown]));
    expect(feed.header.timestamp).toBe(7);
    expect(feed.entity.map((entity) => entity.tripUpdate?.trip.tripId)).toEqual(["t"]);
  });

  it("merges a message field that appears twice, as protobuf specifies", () => {
    const tripId = encodeFeed({ header: { gtfsRealtimeVersion: "2.0" }, entity: [{ id: "a", tripUpdate: { trip: { tripId: "t" } } }] });
    const header = Uint8Array.from([0x0a, 0x02, 0x18, 0x09]); // a second header carrying only timestamp 9
    expect(decodeFeedMessage(Uint8Array.from([...tripId, ...header]))).toMatchObject({
      header: { timestamp: 9 },
      entity: [{ tripUpdate: { trip: { tripId: "t" } } }],
    });
  });

  it("decodes a captured MTA feed", () => {
    const feed = decodeFeedMessage(captured);
    expect(feed.header.timestamp).toBeGreaterThan(1_700_000_000);
    expect(feed.entity.length).toBe(45);
    expect(feed.entity.every((entity) => entity.tripUpdate?.trip.tripId)).toBe(true);
  });

  it("throws, never reads past the end, on a feed cut short anywhere", () => {
    for (let length = 1; length < captured.length; length += 97) {
      try {
        decodeFeedMessage(captured.subarray(0, length));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/^GTFS-Realtime: /);
      }
    }
    expect(() => decodeFeedMessage(Uint8Array.of(0x0a, 0x05, 0x18))).toThrow("runs past its message");
    expect(() => decodeFeedMessage(Uint8Array.of(0xff))).toThrow("truncated varint");
    expect(() => decodeFeedMessage(Uint8Array.of(...Array(11).fill(0xff)))).toThrow("longer than 10 bytes");
    expect(() => decodeFeedMessage(Uint8Array.of(0x0b))).toThrow("wire type 3");
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

  it("splits a feed into top-level fields that are each a valid feed", () => {
    const spans = feedFieldSpans(captured);
    expect(spans[0]!.field).toBe(1);
    expect(spans.filter(({ field }) => field === 2)).toHaveLength(45);
    const rejoined = Uint8Array.from(spans.flatMap(({ start, end }) => [...captured.subarray(start, end)]));
    expect(rejoined).toEqual(captured);
    const one = spans.find(({ field }) => field === 2)!;
    expect(decodeFeedMessage(captured.subarray(one.start, one.end)).entity).toHaveLength(1);
  });
});
