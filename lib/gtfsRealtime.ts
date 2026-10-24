/**
 * Decodes a GTFS-Realtime feed: the header's timestamp, and each trip update's
 * trip, route and stop times, which are all the app reads.
 *
 * It replaces gtfs-realtime-bindings (protobuf.js 8.7.1 code generated from
 * gtfs-realtime.proto) and is a port of how that decoder reads bytes, so the
 * same input gives the same result: the same values, or an error with the same
 * message. That includes its leniencies — lengths truncated to 32 bits,
 * strings that run past the end of their enclosing message, UTF-8 decoded
 * without validation — and its checks: every message type the schema
 * defines is read through, so a malformed vehicle position or alert, or a
 * missing required field anywhere, fails here exactly as it failed there.
 * Only the fields the app reads are kept, so the rest costs no objects.
 *
 * Protobuf never renumbers or retypes a published field, so the schema below
 * stays valid. A field it does not list, such as MTA's NYCT extensions or a
 * field the spec adds later, is skipped as unknown, as protobuf.js skipped it.
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

/** protobuf.js's error for a required field a message lacks. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

/** protobuf.js's limit on nested messages and groups (protoc's default). */
const RECURSION_LIMIT = 100;
const TWO_32 = 4_294_967_296;
/** Shorter strings are decoded by hand, longer ones by TextDecoder, as protobuf.js does. */
const TEXT_DECODER_MIN_LENGTH = 64;
const looseDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

/**
 * protobuf.js's Reader, method for method. Bounds are checked against the
 * whole buffer, never an enclosing message, exactly as it checked them.
 */
class Reader {
  pos = 0;
  readonly len: number;
  /** The halves of the last 64-bit varint read. */
  lo = 0;
  hi = 0;

  constructor(readonly buf: Uint8Array) {
    this.len = buf.length;
  }

  outOfRange(writeLength?: number): RangeError {
    return new RangeError(`index out of range: ${this.pos} + ${writeLength || 1} > ${this.len}`);
  }

  /**
   * A varint as uint32. The first five bytes are read unchecked, as in
   * protobuf.js; a byte past the buffer reads as a continuation byte, so it
   * still ends in the bounds check below.
   */
  uint32(): number {
    const buf = this.buf;
    let pos = this.pos;
    let value = (buf[pos]! & 127) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 127) << 7)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 127) << 14)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 127) << 21)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 15) << 28)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    for (let i = 0; i < 5; i += 1) {
      if (pos >= this.len) {
        this.pos = pos;
        throw this.outOfRange();
      }
      if (buf[pos++]! < 128) return (this.pos = pos), value;
    }
    this.pos = pos;
    throw new Error("invalid varint encoding");
  }

  /** A field key, which unlike other varints must fit in 32 bits. */
  tag(): number {
    const buf = this.buf;
    let pos = this.pos;
    let value = (buf[pos]! & 127) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 127) << 7)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 127) << 14)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 127) << 21)) >>> 0;
    if (buf[pos++]! < 128) return (this.pos = pos), value;
    value = (value | ((buf[pos]! & 15) << 28)) >>> 0;
    if (buf[pos]! < 128 && (buf[pos]! & 112) === 0) return (this.pos = pos + 1), value;
    this.pos = pos + 1;
    throw new Error("invalid tag encoding");
  }

  /** A 64-bit varint into `lo` and `hi` (protobuf.js's readLongVarint). */
  long(): void {
    const buf = this.buf;
    let lo = 0;
    let hi = 0;
    let i = 0;
    if (this.len - this.pos > 4) {
      for (; i < 4; i += 1) {
        lo = (lo | ((buf[this.pos]! & 127) << (i * 7))) >>> 0;
        if (buf[this.pos++]! < 128) return this.setLong(lo, hi);
      }
      lo = (lo | ((buf[this.pos]! & 127) << 28)) >>> 0;
      hi = (hi | ((buf[this.pos]! & 127) >> 4)) >>> 0;
      if (buf[this.pos++]! < 128) return this.setLong(lo, hi);
      i = 0;
    } else {
      for (; i < 4; i += 1) {
        if (this.pos >= this.len) throw this.outOfRange();
        lo = (lo | ((buf[this.pos]! & 127) << (i * 7))) >>> 0;
        if (buf[this.pos++]! < 128) return this.setLong(lo, hi);
      }
      throw this.outOfRange();
    }
    if (this.len - this.pos > 4) {
      for (; i < 5; i += 1) {
        hi = (hi | ((buf[this.pos]! & 127) << (i * 7 + 3))) >>> 0;
        if (buf[this.pos++]! < 128) return this.setLong(lo, hi);
      }
    } else {
      for (; i < 5; i += 1) {
        if (this.pos >= this.len) throw this.outOfRange();
        hi = (hi | ((buf[this.pos]! & 127) << (i * 7 + 3))) >>> 0;
        if (buf[this.pos++]! < 128) return this.setLong(lo, hi);
      }
    }
    throw new Error("invalid varint encoding");
  }

  private setLong(lo: number, hi: number): void {
    this.lo = lo;
    this.hi = hi;
  }

  /** The last long() as protobuf.js's Long gave it to the app: Long.toNumber(). */
  uint64(): number {
    this.long();
    return (this.hi >>> 0) * TWO_32 + (this.lo >>> 0);
  }

  int64(): number {
    this.long();
    return (this.hi | 0) * TWO_32 + (this.lo >>> 0);
  }

  bool(): void {
    for (let i = 0; i < 10; i += 1) {
      if (this.pos >= this.len) throw this.outOfRange();
      if (this.buf[this.pos++]! < 128) return;
    }
    throw new Error("invalid varint encoding");
  }

  /** float and double: protobuf.js reports a double's overrun as 4 bytes, too. */
  fixed(size: 4 | 8): void {
    if (this.pos + size > this.len) throw this.outOfRange(4);
    this.pos += size;
  }

  string(): string {
    const end = this.stringEnd();
    const start = this.pos;
    this.pos = end;
    return readUtf8(this.buf, start, end);
  }

  /** A string the app does not read: protobuf.js's checks, without decoding it. */
  skipString(): void {
    this.pos = this.stringEnd();
  }

  private stringEnd(): number {
    const length = this.uint32();
    const end = this.pos + length;
    if (end > this.len) throw this.outOfRange(length);
    return end;
  }

  skip(length?: number): void {
    if (length !== undefined) {
      if (this.pos + length > this.len) throw this.outOfRange(length);
      this.pos += length;
      return;
    }
    do {
      if (this.pos >= this.len) throw this.outOfRange();
    } while (this.buf[this.pos++]! & 128);
  }

  /** An unknown field, or a known one sent with the wrong wire type. */
  skipType(wireType: number, depth: number, fieldNumber: number): void {
    if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
    if (fieldNumber === 0) throw new Error("illegal tag: field number 0");
    switch (wireType) {
      case 0:
        this.skip();
        return;
      case 1:
        this.skip(8);
        return;
      case 2:
        this.skip(this.uint32());
        return;
      case 3:
        for (;;) {
          const tag = this.tag();
          const nestedField = tag >>> 3;
          const nestedWireType = tag & 7;
          if (!nestedField) throw new Error("illegal tag: field number 0");
          if (nestedWireType === 4) {
            if (nestedField !== fieldNumber) throw new Error("invalid end group tag");
            return;
          }
          this.skipType(nestedWireType, depth + 1, nestedField);
        }
      case 5:
        this.skip(4);
        return;
      default:
        throw new Error(`invalid wire type ${wireType} at offset ${this.pos}`);
    }
  }
}

/** protobuf.js's loose UTF-8 read: no validation, and a cut-off sequence reads on past `end`. */
function readUtf8(buf: Uint8Array, start: number, end: number): string {
  if (end - start < 1) return "";
  if (end - start >= TEXT_DECODER_MIN_LENGTH) return looseDecoder.decode(buf.subarray(start, end));
  let text = "";
  for (let i = start; i < end; i += 1) {
    if (buf[i]! & 0x80) return readUtf8Slow(buf, i, end, text);
    text += String.fromCharCode(buf[i]!);
  }
  return text;
}

function readUtf8Slow(buf: Uint8Array, start: number, end: number, prefix: string): string {
  let text = prefix;
  for (let i = start; i < end; ) {
    const t = buf[i++]!;
    if (t <= 0x7f) {
      text += String.fromCharCode(t);
    } else if (t >= 0xc0 && t < 0xe0) {
      const c = ((t & 0x1f) << 6) | (buf[i++]! & 0x3f);
      text += c >= 0x80 ? String.fromCharCode(c) : "�";
    } else if (t >= 0xe0 && t < 0xf0) {
      const c = ((t & 0xf) << 12) | ((buf[i++]! & 0x3f) << 6) | (buf[i++]! & 0x3f);
      text += c >= 0x800 ? String.fromCharCode(c) : "�";
    } else if (t >= 0xf0) {
      const c = ((t & 7) << 18) | ((buf[i++]! & 0x3f) << 12) | ((buf[i++]! & 0x3f) << 6) | (buf[i++]! & 0x3f);
      if (c < 0x10000 || c > 0x10ffff) {
        text += "�";
      } else {
        text += String.fromCharCode(0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff));
      }
    }
    // A stray continuation byte (0x80–0xbf) adds nothing, as in protobuf.js.
  }
  return text;
}

/**
 * gtfs-realtime.proto as gtfs-realtime-bindings 2.2.0 generated it: each
 * message's fields by number, and its required fields in the order
 * protobuf.js checks them. A field type is a scalar or another message's
 * name; `[]` marks a repeated message field.
 */
type Scalar = "string" | "int32" | "uint32" | "bool" | "int64" | "uint64" | "float" | "double";
type MessageSchema = { fields: Record<number, string>; required?: Array<[number, string]> };

export const SCHEMA: Record<string, MessageSchema> = {
  FeedMessage: { fields: { 1: "FeedHeader", 2: "FeedEntity[]" }, required: [[1, "header"]] },
  FeedHeader: { fields: { 1: "string", 2: "int32", 3: "uint64", 4: "string" }, required: [[1, "gtfsRealtimeVersion"]] },
  FeedEntity: {
    fields: { 1: "string", 2: "bool", 3: "TripUpdate", 4: "VehiclePosition", 5: "Alert", 6: "Shape", 7: "Stop", 8: "TripModifications" },
    required: [[1, "id"]],
  },
  TripUpdate: {
    fields: { 1: "TripDescriptor", 2: "StopTimeUpdate[]", 3: "VehicleDescriptor", 4: "uint64", 5: "int32", 6: "TripProperties" },
    required: [[1, "trip"]],
  },
  StopTimeEvent: { fields: { 1: "int32", 2: "int64", 3: "int32", 4: "int64" } },
  StopTimeUpdate: {
    fields: { 1: "uint32", 2: "StopTimeEvent", 3: "StopTimeEvent", 4: "string", 5: "int32", 6: "StopTimeProperties", 7: "int32" },
  },
  StopTimeProperties: { fields: { 1: "string", 2: "string", 3: "int32", 4: "int32" } },
  TripProperties: { fields: { 1: "string", 2: "string", 3: "string", 4: "string", 5: "string", 6: "string" } },
  VehiclePosition: {
    fields: {
      1: "TripDescriptor", 2: "Position", 3: "uint32", 4: "int32", 5: "uint64", 6: "int32",
      7: "string", 8: "VehicleDescriptor", 9: "int32", 10: "uint32", 11: "CarriageDetails[]",
    },
  },
  CarriageDetails: { fields: { 1: "string", 2: "string", 3: "int32", 4: "int32", 5: "uint32" } },
  Alert: {
    fields: {
      1: "TimeRange[]", 2: "TimeRange[]", 3: "TimeRange[]", 5: "EntitySelector[]", 6: "int32", 7: "int32",
      8: "TranslatedString", 10: "TranslatedString", 11: "TranslatedString", 12: "TranslatedString",
      13: "TranslatedString", 14: "int32", 15: "TranslatedImage", 16: "TranslatedString",
      17: "TranslatedString", 18: "TranslatedString",
    },
  },
  TimeRange: { fields: { 1: "uint64", 2: "uint64" } },
  Position: {
    fields: { 1: "float", 2: "float", 3: "float", 4: "double", 5: "float" },
    required: [[1, "latitude"], [2, "longitude"]],
  },
  TripDescriptor: {
    fields: { 1: "string", 2: "string", 3: "string", 4: "int32", 5: "string", 6: "uint32", 7: "ModifiedTripSelector" },
  },
  ModifiedTripSelector: { fields: { 1: "string", 2: "string", 3: "string", 4: "string" } },
  VehicleDescriptor: { fields: { 1: "string", 2: "string", 3: "string", 4: "int32" } },
  EntitySelector: { fields: { 1: "string", 2: "string", 3: "int32", 4: "TripDescriptor", 5: "string", 6: "uint32" } },
  TranslatedString: { fields: { 1: "Translation[]" } },
  Translation: { fields: { 1: "string", 2: "string" }, required: [[1, "text"]] },
  TranslatedImage: { fields: { 1: "LocalizedImage[]" } },
  LocalizedImage: { fields: { 1: "string", 2: "string", 3: "string" }, required: [[1, "url"], [2, "mediaType"]] },
  Shape: { fields: { 1: "string", 2: "string" } },
  Stop: {
    fields: {
      1: "string", 2: "TranslatedString", 3: "TranslatedString", 4: "TranslatedString", 5: "TranslatedString",
      6: "float", 7: "float", 8: "string", 9: "TranslatedString", 11: "string", 12: "string", 13: "int32",
      14: "string", 15: "TranslatedString",
    },
  },
  TripModifications: { fields: { 1: "SelectedTrips[]", 2: "string", 3: "string", 4: "Modification[]" } },
  Modification: { fields: { 1: "StopSelector", 2: "StopSelector", 3: "int32", 4: "ReplacementStop[]", 5: "string", 6: "uint64" } },
  SelectedTrips: { fields: { 1: "string", 2: "string" } },
  StopSelector: { fields: { 1: "uint32", 2: "string" } },
  ReplacementStop: { fields: { 1: "int32", 2: "string" } },
};

const WIRE_TYPE: Record<Scalar, number> = {
  string: 2, int32: 0, uint32: 0, bool: 0, int64: 0, uint64: 0, float: 5, double: 1,
};

/** A field as the decoders use it. */
type Field = { wireType: number; scalar: Scalar | null; message: string | null; repeated: boolean };

const FIELDS: Record<string, Map<number, Field>> = Object.fromEntries(
  Object.entries(SCHEMA).map(([name, { fields }]) => [
    name,
    new Map(
      Object.entries(fields).map(([number, type]) => {
        const repeated = type.endsWith("[]");
        const base = repeated ? type.slice(0, -2) : type;
        const scalar = Object.hasOwn(WIRE_TYPE, base) ? (base as Scalar) : null;
        return [Number(number), { wireType: scalar ? WIRE_TYPE[scalar] : 2, scalar, message: scalar ? null : base, repeated }];
      }),
    ),
  ]),
);

/**
 * Whether reading a message can fail on a required field, counting singular
 * message fields within it. Those merge when a field repeats, as protobuf.js
 * merges them, so which required fields were seen carries over.
 */
const TRACKS_REQUIRED = new Map<string, boolean>();
function tracksRequired(name: string): boolean {
  let known = TRACKS_REQUIRED.get(name);
  if (known === undefined) {
    TRACKS_REQUIRED.set(name, false);
    known =
      Boolean(SCHEMA[name]!.required?.length) ||
      [...FIELDS[name]!.values()].some((field) => field.message && !field.repeated && tracksRequired(field.message));
    TRACKS_REQUIRED.set(name, known);
  }
  return known;
}

/** Which required fields a message has had, and the same for its singular message fields. */
type Seen = { fields: Set<number>; children: Map<number, Seen> };
const newSeen = (): Seen => ({ fields: new Set(), children: new Map() });

function checkRequired(name: string, seen: Seen | undefined): void {
  for (const [number, field] of SCHEMA[name]!.required ?? []) {
    if (!seen?.fields.has(number)) throw new ProtocolError(`missing required '${field}'`);
  }
}

/**
 * Reads one field the app does not keep, with exactly the reads protobuf.js
 * made for it. Returns false for an unknown field or a wrong wire type, which
 * the caller then skips by wire type.
 */
function skipField(reader: Reader, message: string, number: number, wireType: number, depth: number, seen: Seen | undefined): boolean {
  const field = FIELDS[message]!.get(number);
  if (!field || field.wireType !== wireType) return false;
  seen?.fields.add(number);
  switch (field.scalar) {
    case "string":
      reader.skipString();
      break;
    case "int32":
    case "uint32":
      reader.uint32();
      break;
    case "bool":
      reader.bool();
      break;
    case "int64":
    case "uint64":
      reader.long();
      break;
    case "float":
      reader.fixed(4);
      break;
    case "double":
      reader.fixed(8);
      break;
    case null: {
      const child = field.message!;
      let childSeen: Seen | undefined;
      if (!field.repeated && seen && tracksRequired(child)) {
        childSeen = seen.children.get(number) ?? newSeen();
        seen.children.set(number, childSeen);
      }
      skipMessage(reader, child, reader.uint32(), depth + 1, childSeen);
    }
  }
  return true;
}

function skipMessage(reader: Reader, message: string, length: number, depth: number, seen?: Seen): void {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const end = reader.pos + length;
  const merged = seen ?? (tracksRequired(message) ? newSeen() : undefined);
  while (reader.pos < end) {
    const tag = reader.tag();
    if (!skipField(reader, message, tag >>> 3, tag & 7, depth, merged)) reader.skipType(tag & 7, depth, tag >>> 3);
  }
  checkRequired(message, merged);
}

/**
 * The messages the app reads. Each follows protobuf.js's generated decode:
 * read fields until the message's end, skip unknown ones, check required
 * fields last.
 */
function readStopTimeEvent(reader: Reader, length: number, depth: number, event: StopTimeEvent | null): StopTimeEvent {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const result = event ?? { time: 0 };
  const end = reader.pos + length;
  while (reader.pos < end) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 2 && wireType === 0) result.time = reader.int64();
    else if (!skipField(reader, "StopTimeEvent", number, wireType, depth, undefined)) reader.skipType(wireType, depth, number);
  }
  return result;
}

function readStopTimeUpdate(reader: Reader, length: number, depth: number): StopTimeUpdate {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const update: StopTimeUpdate = { stopId: "", arrival: null, departure: null };
  const end = reader.pos + length;
  while (reader.pos < end) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 4 && wireType === 2) update.stopId = reader.string();
    else if (number === 2 && wireType === 2) update.arrival = readStopTimeEvent(reader, reader.uint32(), depth + 1, update.arrival);
    else if (number === 3 && wireType === 2) update.departure = readStopTimeEvent(reader, reader.uint32(), depth + 1, update.departure);
    else if (!skipField(reader, "StopTimeUpdate", number, wireType, depth, undefined)) reader.skipType(wireType, depth, number);
  }
  return update;
}

function readTripDescriptor(reader: Reader, length: number, depth: number, trip: TripDescriptor | null): TripDescriptor {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const result = trip ?? { tripId: "", routeId: "" };
  const end = reader.pos + length;
  while (reader.pos < end) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 1 && wireType === 2) result.tripId = reader.string();
    else if (number === 5 && wireType === 2) result.routeId = reader.string();
    else if (!skipField(reader, "TripDescriptor", number, wireType, depth, undefined)) reader.skipType(wireType, depth, number);
  }
  return result;
}

/** A trip update, merged into `update` when the entity repeats the field. */
function readTripUpdate(reader: Reader, length: number, depth: number, update: { value: TripUpdate | null; trip: TripDescriptor | null }): void {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const stopTimeUpdate = update.value?.stopTimeUpdate ?? [];
  const end = reader.pos + length;
  while (reader.pos < end) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 1 && wireType === 2) update.trip = readTripDescriptor(reader, reader.uint32(), depth + 1, update.trip);
    else if (number === 2 && wireType === 2) stopTimeUpdate.push(readStopTimeUpdate(reader, reader.uint32(), depth + 1));
    else if (!skipField(reader, "TripUpdate", number, wireType, depth, undefined)) reader.skipType(wireType, depth, number);
  }
  if (!update.trip) throw new ProtocolError("missing required 'trip'");
  update.value = { trip: update.trip, stopTimeUpdate };
}

function readEntity(reader: Reader, length: number, depth: number): FeedEntity {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const seen = newSeen();
  const tripUpdate: { value: TripUpdate | null; trip: TripDescriptor | null } = { value: null, trip: null };
  const end = reader.pos + length;
  while (reader.pos < end) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 3 && wireType === 2) readTripUpdate(reader, reader.uint32(), depth + 1, tripUpdate);
    else if (!skipField(reader, "FeedEntity", number, wireType, depth, seen)) reader.skipType(wireType, depth, number);
  }
  checkRequired("FeedEntity", seen);
  return { tripUpdate: tripUpdate.value };
}

/** Decodes a whole feed, or throws the error protobuf.js threw for the same bytes. */
export function decodeFeedMessage(bytes: Uint8Array): FeedMessage {
  const reader = new Reader(bytes);
  const feed: FeedMessage = { header: { timestamp: 0 }, entity: [] };
  const headerSeen = newSeen();
  let hasHeader = false;
  while (reader.pos < reader.len) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 1 && wireType === 2) {
      readHeader(reader, reader.uint32(), 1, feed.header, headerSeen);
      hasHeader = true;
    } else if (number === 2 && wireType === 2) {
      feed.entity.push(readEntity(reader, reader.uint32(), 1));
    } else {
      reader.skipType(wireType, 0, number);
    }
  }
  if (!hasHeader) throw new ProtocolError("missing required 'header'");
  return feed;
}

function readHeader(reader: Reader, length: number, depth: number, header: { timestamp: number }, seen: Seen): void {
  if (depth > RECURSION_LIMIT) throw new Error("max depth exceeded");
  const end = reader.pos + length;
  while (reader.pos < end) {
    const tag = reader.tag();
    const number = tag >>> 3;
    const wireType = tag & 7;
    if (number === 3 && wireType === 0) header.timestamp = reader.uint64();
    else if (!skipField(reader, "FeedHeader", number, wireType, depth, seen)) reader.skipType(wireType, depth, number);
  }
  checkRequired("FeedHeader", seen);
}

/**
 * Where each top-level field of a well-formed feed lies, tag included. Any
 * such span is itself a valid feed, and so is any concatenation of them, so a
 * script can keep a subset of a feed byte for byte as MTA sent it.
 */
export function feedFieldSpans(bytes: Uint8Array): Array<{ field: number; start: number; end: number }> {
  const spans: Array<{ field: number; start: number; end: number }> = [];
  const reader = new Reader(bytes);
  while (reader.pos < reader.len) {
    const start = reader.pos;
    const tag = reader.tag();
    reader.skipType(tag & 7, 0, tag >>> 3);
    spans.push({ field: tag >>> 3, start, end: reader.pos });
  }
  return spans;
}
