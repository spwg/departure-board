/**
 * Decodes the parts of a GTFS-Realtime feed this app reads: the header's
 * timestamp, and each trip update's trip, route and stop times.
 *
 * GTFS-Realtime is protocol buffers, and protobuf never renumbers or retypes a
 * published field, so the field numbers below (from the official
 * gtfs-realtime.proto) stay valid for good. Every other field — vehicle
 * positions, alerts, MTA's NYCT extensions, anything added later — is skipped
 * by its wire type, so a new field in the feed cannot break decoding.
 *
 * The bytes come from the network, so every read is bounds-checked and a
 * malformed feed throws rather than reading past its end.
 *
 * The shapes and defaults match what the generated protobuf.js bindings
 * returned: absent strings and numbers read as "" and 0, absent messages as
 * null, and a field that appears twice merges as protobuf specifies.
 */

export type StopTimeEvent = { time: number };
export type StopTimeUpdate = {
  stopId: string;
  arrival: StopTimeEvent | null;
  departure: StopTimeEvent | null;
};
export type TripDescriptor = { tripId: string; routeId: string };
export type TripUpdate = { trip: TripDescriptor; stopTimeUpdate: StopTimeUpdate[] };
export type FeedEntity = { tripUpdate: TripUpdate | null };
export type FeedMessage = { header: { timestamp: number }; entity: FeedEntity[] };

const VARINT = 0;
const FIXED64 = 1;
const LENGTH_DELIMITED = 2;
const FIXED32 = 5;

const utf8 = new TextDecoder();

class Reader {
  pos: number;

  constructor(
    readonly bytes: Uint8Array,
    start = 0,
    readonly end = bytes.length,
  ) {
    this.pos = start;
  }

  done(): boolean {
    return this.pos >= this.end;
  }

  /**
   * An unsigned varint, exact up to 2^53. Larger values (only a negative
   * int64 here) lose precision but keep their sign through int64().
   */
  varint(): number {
    let value = 0;
    let scale = 1;
    for (let index = 0; index < 10; index += 1) {
      if (this.pos >= this.end) throw new Error("GTFS-Realtime: truncated varint");
      const byte = this.bytes[this.pos++]!;
      value += (byte & 0x7f) * scale;
      if ((byte & 0x80) === 0) return value;
      scale *= 128;
    }
    throw new Error("GTFS-Realtime: varint longer than 10 bytes");
  }

  int64(): number {
    const value = this.varint();
    return value >= 2 ** 63 ? value - 2 ** 64 : value;
  }

  /** A length-delimited field's bounds, checked against the enclosing message. */
  span(): { start: number; end: number } {
    const length = this.varint();
    const start = this.pos;
    const end = start + length;
    if (end > this.end) throw new Error("GTFS-Realtime: field runs past its message");
    this.pos = end;
    return { start, end };
  }

  string(): string {
    const { start, end } = this.span();
    return utf8.decode(this.bytes.subarray(start, end));
  }

  /** A nested message, read by its own Reader confined to its bytes. */
  message(): Reader {
    const { start, end } = this.span();
    return new Reader(this.bytes, start, end);
  }

  skip(wireType: number): void {
    switch (wireType) {
      case VARINT:
        this.varint();
        return;
      case FIXED64:
        this.advance(8);
        return;
      case LENGTH_DELIMITED:
        this.span();
        return;
      case FIXED32:
        this.advance(4);
        return;
      default:
        // Groups (3 and 4) were deprecated before GTFS-Realtime existed.
        throw new Error(`GTFS-Realtime: unsupported wire type ${wireType}`);
    }
  }

  private advance(count: number): void {
    if (this.pos + count > this.end) throw new Error("GTFS-Realtime: truncated field");
    this.pos += count;
  }

  /** Calls `read` with each field's number until the message ends. */
  fields(read: (field: number, wireType: number) => boolean): void {
    while (!this.done()) {
      const key = this.varint();
      const field = Math.floor(key / 8);
      const wireType = key % 8;
      if (field === 0) throw new Error("GTFS-Realtime: field number 0");
      if (!read(field, wireType)) this.skip(wireType);
    }
  }
}

/** Reads `field` only when it arrives with the wire type the schema gives it. */
function is(wireType: number, expected: number): boolean {
  return wireType === expected;
}

function readStopTimeEvent(reader: Reader, event: StopTimeEvent = { time: 0 }): StopTimeEvent {
  reader.fields((field, wireType) => {
    if (field === 2 && is(wireType, VARINT)) event.time = reader.int64();
    else return false;
    return true;
  });
  return event;
}

function readStopTimeUpdate(reader: Reader): StopTimeUpdate {
  const update: StopTimeUpdate = { stopId: "", arrival: null, departure: null };
  reader.fields((field, wireType) => {
    if (field === 4 && is(wireType, LENGTH_DELIMITED)) update.stopId = reader.string();
    else if (field === 2 && is(wireType, LENGTH_DELIMITED)) {
      update.arrival = readStopTimeEvent(reader.message(), update.arrival ?? undefined);
    } else if (field === 3 && is(wireType, LENGTH_DELIMITED)) {
      update.departure = readStopTimeEvent(reader.message(), update.departure ?? undefined);
    } else return false;
    return true;
  });
  return update;
}

function readTripDescriptor(reader: Reader, trip: TripDescriptor): TripDescriptor {
  reader.fields((field, wireType) => {
    if (field === 1 && is(wireType, LENGTH_DELIMITED)) trip.tripId = reader.string();
    else if (field === 5 && is(wireType, LENGTH_DELIMITED)) trip.routeId = reader.string();
    else return false;
    return true;
  });
  return trip;
}

function readTripUpdate(reader: Reader, update?: TripUpdate): TripUpdate {
  const result = update ?? { trip: { tripId: "", routeId: "" }, stopTimeUpdate: [] };
  reader.fields((field, wireType) => {
    if (field === 1 && is(wireType, LENGTH_DELIMITED)) readTripDescriptor(reader.message(), result.trip);
    else if (field === 2 && is(wireType, LENGTH_DELIMITED)) {
      result.stopTimeUpdate.push(readStopTimeUpdate(reader.message()));
    } else return false;
    return true;
  });
  return result;
}

function readEntity(reader: Reader): FeedEntity {
  const entity: FeedEntity = { tripUpdate: null };
  reader.fields((field, wireType) => {
    if (field === 3 && is(wireType, LENGTH_DELIMITED)) {
      entity.tripUpdate = readTripUpdate(reader.message(), entity.tripUpdate ?? undefined);
    } else return false;
    return true;
  });
  return entity;
}

/** Decodes a whole feed. Throws on bytes that are not a well-formed protobuf message. */
export function decodeFeedMessage(bytes: Uint8Array): FeedMessage {
  const feed: FeedMessage = { header: { timestamp: 0 }, entity: [] };
  const reader = new Reader(bytes);
  reader.fields((field, wireType) => {
    if (field === 1 && is(wireType, LENGTH_DELIMITED)) {
      const header = reader.message();
      header.fields((headerField, headerWireType) => {
        if (headerField !== 3 || !is(headerWireType, VARINT)) return false;
        feed.header.timestamp = header.varint();
        return true;
      });
    } else if (field === 2 && is(wireType, LENGTH_DELIMITED)) {
      feed.entity.push(readEntity(reader.message()));
    } else return false;
    return true;
  });
  return feed;
}

/**
 * Where each top-level field of a feed lies, tag included. Any such span is
 * itself a valid feed, and so is any concatenation of them, so a script can
 * keep a subset of a feed byte for byte as MTA sent it.
 */
export function feedFieldSpans(bytes: Uint8Array): Array<{ field: number; start: number; end: number }> {
  const spans: Array<{ field: number; start: number; end: number }> = [];
  const reader = new Reader(bytes);
  while (!reader.done()) {
    const start = reader.pos;
    const key = reader.varint();
    reader.skip(key % 8);
    spans.push({ field: Math.floor(key / 8), start, end: reader.pos });
  }
  return spans;
}
