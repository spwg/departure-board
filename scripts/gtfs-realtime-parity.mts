/**
 * Checks lib/gtfsRealtime against the decoder it replaced: protobuf.js 8.7.1
 * code from gtfs-realtime-bindings 2.2.0, installed outside this repository
 * so the app never depends on it again:
 *
 *   mkdir -p /tmp/gtfs-ref && cd /tmp/gtfs-ref
 *   echo '{"private":true,"overrides":{"protobufjs":"8.7.1","long":"5.3.2"}}' > package.json
 *   npm install --ignore-scripts gtfs-realtime-bindings@2.2.0
 *
 * Then, from the repository root:
 *
 *   npx tsx scripts/gtfs-realtime-parity.mts schema /tmp/gtfs-ref
 *     lib/gtfsRealtime's schema table against the generated decoders.
 *   npx tsx scripts/gtfs-realtime-parity.mts fuzz /tmp/gtfs-ref [rounds] [seed]
 *     Differential fuzzing: generated, mutated and live MTA feeds through
 *     both decoders, which must agree on every value or error message.
 *   npx tsx scripts/gtfs-realtime-parity.mts corpus /tmp/gtfs-ref
 *     Rewrites tests/fixtures/gtfs-realtime-parity.json, which the unit tests
 *     check without protobuf.js.
 *   npx tsx scripts/gtfs-realtime-parity.mts bench /tmp/gtfs-ref [runs]
 *     Decode time for the live MTA feeds, each decoder in its own processes.
 *
 * Both decoders always get a plain Uint8Array, as production gave protobuf.js
 * one (never a Node Buffer, which it decodes strings from differently).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { decodeFeedMessage, SCHEMA } from "../lib/gtfsRealtime";

const MTA_FEEDS = ["", "-ace", "-bdfm", "-g", "-jz", "-nqrw", "-l", "-si"].map(
  (suffix) => `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs${suffix}`,
);
const CORPUS = "tests/fixtures/gtfs-realtime-parity.json";
const FIXTURES = ["mta-123.pb", "mta-nqrw.pb"];

// --- The reference decoder ---------------------------------------------------

type LongLike = number | { toNumber(): number } | null | undefined;
type ReferenceFeed = {
  header: { timestamp: LongLike };
  entity: Array<{
    tripUpdate: {
      trip: { tripId: string; routeId: string };
      stopTimeUpdate: Array<{ stopId: string; arrival: { time: LongLike } | null; departure: { time: LongLike } | null }>;
    } | null;
  }>;
};
type Bindings = { transit_realtime: { FeedMessage: { decode(bytes: Uint8Array): ReferenceFeed } } };

function loadReference(directory: string): { decode(bytes: Uint8Array): ReferenceFeed; source: string } {
  const require = createRequire(path.resolve(directory, "package.json"));
  const file = require.resolve("gtfs-realtime-bindings");
  const version: string = require("protobufjs/package.json").version;
  if (version !== "8.7.1") throw new Error(`Expected protobufjs 8.7.1 in ${directory}, found ${version}`);
  const bindings = require("gtfs-realtime-bindings") as Bindings;
  return { decode: (bytes) => bindings.transit_realtime.FeedMessage.decode(bytes), source: readFileSync(file, "utf8") };
}

// The app's conversion of protobuf.js's values (lib/subway.ts before the switch).
const seconds = (value: LongLike) => (value == null ? null : typeof value === "number" ? value : value.toNumber());

/** protobuf.js's result in lib/gtfsRealtime's shape: exactly the fields the app reads. */
function project(feed: ReferenceFeed) {
  const event = (e: { time: LongLike } | null) => (e ? { time: seconds(e.time) } : null);
  return {
    header: { timestamp: seconds(feed.header.timestamp) },
    entity: feed.entity.map(({ tripUpdate }) => ({
      tripUpdate: tripUpdate
        ? {
            trip: { tripId: tripUpdate.trip.tripId, routeId: tripUpdate.trip.routeId },
            stopTimeUpdate: tripUpdate.stopTimeUpdate.map((u) => ({ stopId: u.stopId, arrival: event(u.arrival), departure: event(u.departure) })),
          }
        : null,
    })),
  };
}

type Outcome = { ok: unknown } | { error: { name: string; message: string } };
function outcome(decode: () => unknown): Outcome {
  try {
    return { ok: decode() };
  } catch (error) {
    return { error: { name: (error as Error).name, message: (error as Error).message } };
  }
}
const plain = (bytes: Uint8Array) => Uint8Array.from(bytes);

// --- The generated schema, read from protobuf.js's decoders --------------------

type GeneratedMessage = { fields: Record<number, string>; required: string[]; requiredNumbers: number[] };
const SCALAR_WIRE: Record<string, number> = { string: 2, int32: 0, uint32: 0, bool: 0, int64: 0, uint64: 0, float: 5, double: 1 };

function generatedSchema(source: string): Record<string, GeneratedMessage> {
  const schema: Record<string, GeneratedMessage> = {};
  const decoders = /(\w+(?:\.\w+)*)\.decode = function decode\(reader, length, _end, _depth, _target\) \{([\s\S]*?)\n {8,}\};/g;
  const cases = /case (\d+): \{\s*if \(wireType !== (\d+)\)\s*break;\s*([\s\S]*?)continue;/g;
  for (const [, name, body] of source.matchAll(decoders)) {
    const fields: Record<number, string> = {};
    const assigned: Record<number, string> = {};
    for (const [, number, wire, code] of body!.matchAll(cases)) {
      const scalar = code!.match(/= reader\.(\w+)\(\)|\.push\(reader\.(\w+)\(\)\)/);
      const nested = code!.match(/transit_realtime\.([\w.]+)\.decode/);
      const type = scalar ? (scalar[1] ?? scalar[2])! : nested![1]!.split(".").at(-1)!;
      fields[Number(number)] = type + (!scalar && /\.push\(/.test(code!) ? "[]" : "");
      if ((scalar ? SCALAR_WIRE[type] : 2) !== Number(wire)) throw new Error(`${name}.${number}: wire type ${wire} for ${type}`);
      assigned[Number(number)] = code!.match(/message\.(\w+)/)![1]!;
    }
    const required = [...body!.matchAll(/missing required '(\w+)'/g)].map(([, field]) => field!);
    const requiredNumbers = required.map((field) => Number(Object.entries(assigned).find(([, f]) => f === field)![0]));
    schema[name!.split(".").at(-1)!] = { fields, required, requiredNumbers };
  }
  return schema;
}

function checkSchema(generated: Record<string, GeneratedMessage>): number {
  let differences = 0;
  for (const name of new Set([...Object.keys(generated), ...Object.keys(SCHEMA)])) {
    const theirs = generated[name];
    const ours = SCHEMA[name];
    const sorted = (fields: Record<number, string>) => JSON.stringify(Object.entries(fields).sort());
    const problem = !theirs || !ours
      ? `missing ${!theirs ? "from the generated code" : "from lib/gtfsRealtime"}`
      : sorted(theirs.fields) !== sorted(ours.fields)
        ? "fields differ"
        : JSON.stringify(theirs.required) !== JSON.stringify((ours.required ?? []).map(([, field]) => field))
          ? "required fields differ"
          : null;
    if (problem) {
      differences += 1;
      console.log(`${name}: ${problem}`);
    }
  }
  console.log(`${Object.keys(generated).length} message types compared, ${differences} differences`);
  return differences;
}

// --- Generating feeds ---------------------------------------------------------

let seed = 1;
const random = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 2_246_822_519) + 0x9e3779b9) >>> 0), seed / 2 ** 32);
const int = (n: number) => Math.floor(random() * n);
const pick = <T,>(items: T[]) => items[int(items.length)]!;
const chance = (p: number) => random() < p;
/** Chance that any one element of a generated feed is malformed, set per feed. */
let noise = 0;

function varint(value: bigint): number[] {
  let rest = BigInt.asUintN(64, value);
  const out: number[] = [];
  do {
    let byte = Number(rest & BigInt(0x7f));
    rest >>= BigInt(7);
    if (rest) byte |= 0x80;
    out.push(byte);
  } while (rest);
  return out;
}
const key = (field: number, wire: number) => varint(BigInt(field) * BigInt(8) + BigInt(wire));
const delimited = (field: number, body: number[]) => [...key(field, 2), ...varint(BigInt(body.length)), ...body];
function append(out: number[], items: number[]): void {
  for (const item of items) out.push(item);
}

const randomVarint = () =>
  pick([
    () => BigInt(int(128)),
    () => BigInt(int(2 ** 31)),
    () => BigInt(1_700_000_000 + int(200_000_000)),
    () => BigInt(int(2 ** 32)) * BigInt(int(2 ** 32)) + BigInt(int(2 ** 32)),
    () => -BigInt(int(2 ** 40)),
    () => BigInt(2 ** 53 + int(4096)),
    () => (BigInt(1) << BigInt(63)) - BigInt(int(8)),
  ])();

function randomString(): number[] {
  const length = pick([0, 1, 3, 7, 8, 9, 15, 40, 63, 64, 65, 120]);
  const style = int(5);
  const out: number[] = [];
  while (out.length < length) {
    if (style === 0) out.push(0x20 + int(95));
    else if (style === 1) append(out, [...Buffer.from(pick(["é", "→", "🚇", "Ω", "中"]))]);
    else if (style === 2) out.push(int(256));
    else if (style === 3) out.push(pick([0xc0, 0xc1, 0xe0, 0xf0, 0xf8, 0x80, 0xbf, 0xed, 0xa0]));
    else append(out, [0x30 + int(10), ...(chance(0.1) ? [0xe2] : [])]);
  }
  return out.slice(0, length + (style === 4 ? 1 : 0));
}

function randomGroup(depth: number): number[] {
  const field = 1 + int(20);
  const inner = depth < 3 && chance(0.3) ? randomGroup(depth + 1) : [...key(1 + int(5), 0), ...varint(randomVarint())];
  return [...key(field, 3), ...inner, ...key(chance(noise) ? field + 1 : field, 4)];
}

function unknownField(depth: number): number[] {
  const field = pick([9, 19, 99, 1001, 1002, 65_000, 1 + int(30)]);
  switch (chance(noise) ? pick([4, 6, 7]) : pick([0, 1, 2, 3, 5])) {
    case 0: return [...key(field, 0), ...varint(randomVarint())];
    case 1: return [...key(field, 1), ...Array.from({ length: 8 }, () => int(256))];
    case 2: return delimited(field, randomString());
    case 3: return randomGroup(depth);
    case 5: return [...key(field, 5), 1, 2, 3, 4];
    default: return [...key(field, pick([4, 6, 7])), ...varint(randomVarint())];
  }
}

/** The messages the app reads, weighted so generated feeds are full of them. */
const APP_MESSAGES = new Set(["FeedMessage", "FeedHeader", "FeedEntity", "TripUpdate", "TripDescriptor", "StopTimeUpdate", "StopTimeEvent"]);

function generator(schema: Record<string, GeneratedMessage>) {
  function value(type: string, depth: number, omitRequired: boolean): number[] {
    if (type === "string") return randomString();
    if (type === "float") return Array.from({ length: 4 }, () => int(256));
    if (type === "double") return Array.from({ length: 8 }, () => int(256));
    if (type in SCALAR_WIRE) return varint(randomVarint());
    return message(type, depth + 1, omitRequired);
  }
  function encodeField(field: number, type: string, depth: number, omitRequired = false): number[] {
    const base = type.replace("[]", "");
    const wire = SCALAR_WIRE[base] ?? 2;
    const body = value(base, depth, omitRequired);
    return wire === 2 ? delimited(field, body) : [...key(field, wire), ...body];
  }
  function message(name: string, depth: number, omitRequired = false): number[] {
    const { fields, requiredNumbers } = schema[name]!;
    const entries = Object.entries(fields).map(([n, t]) => [Number(n), t] as const);
    const out: number[] = [];
    for (const [n, t] of entries) {
      if (requiredNumbers.includes(n) && !omitRequired && !chance(noise)) append(out, encodeField(n, t, depth));
    }
    const count = depth > 5 ? int(2) : APP_MESSAGES.has(name) ? 2 + int(6) : int(5);
    for (let i = 0; i < count; i += 1) {
      const r = random();
      if (r < 0.85 && entries.length) {
        let [n, t] = pick(entries);
        if (name === "FeedMessage" && chance(0.7)) [n, t] = [2, "FeedEntity[]"];
        if (name === "FeedEntity" && chance(0.6)) [n, t] = chance(0.8) ? [3, "TripUpdate"] : [4, "VehiclePosition"];
        if (name === "VehiclePosition" && chance(0.5)) [n, t] = [2, "Position"];
        if (name === "TripUpdate" && chance(0.6)) [n, t] = [2, "StopTimeUpdate[]"];
        append(out, encodeField(n, t, depth));
        // The same singular message field again, without its required fields:
        // valid only because protobuf merges the two occurrences.
        if (!t.endsWith("[]") && !(t in SCALAR_WIRE) && chance(0.3)) append(out, encodeField(n, t, depth, true));
      } else if (r < 0.95 || !chance(noise * 4)) {
        append(out, unknownField(depth));
      } else if (entries.length) {
        const [n] = pick(entries);
        const wire = pick([0, 1, 2, 5]);
        append(out, [...key(n, wire), ...(wire === 0 ? varint(randomVarint()) : wire === 1 ? Array(8).fill(7) : wire === 5 ? [1, 2, 3, 4] : [...varint(BigInt(3)), 0x41, 0x42, 0x43])]);
      }
    }
    return out;
  }
  return () => Uint8Array.from(message("FeedMessage", 0));
}

function mutate(bytes: Uint8Array): Uint8Array {
  const join = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  };
  let b = Uint8Array.from(bytes);
  for (let edits = 1 + int(3); edits > 0 && b.length; edits -= 1) {
    const at = int(b.length);
    switch (int(7)) {
      case 0: b[at] = int(256); break;
      case 1: b[at]! ^= 1 << int(8); break;
      case 2: b = join(b.subarray(0, at), b.subarray(at + 1)); break;
      case 3: b = join(b.subarray(0, at), Uint8Array.of(int(256)), b.subarray(at)); break;
      case 4: b = b.slice(0, at); break;
      case 5: { const from = int(b.length); b = join(b.subarray(0, at), b.slice(from, from + int(40)), b.subarray(at)); break; }
      default: b[at] = pick([0x00, 0x7f, 0x80, 0xff, 0x08, 0x0a, 0x12]);
    }
  }
  return b;
}

async function liveFeeds(): Promise<Uint8Array[]> {
  return Promise.all(MTA_FEEDS.map(async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }));
}

// --- Commands -----------------------------------------------------------------

async function fuzz(reference: ReturnType<typeof loadReference>, rounds: number) {
  const generate = generator(generatedSchema(reference.source));
  const real = [...FIXTURES.map((f) => new Uint8Array(readFileSync(`tests/fixtures/${f}`))), ...(await liveFeeds())];
  const stats = { cases: 0, bothOk: 0, bothError: 0, mismatches: 0 };
  const check = (bytes: Uint8Array) => {
    const theirs = outcome(() => project(reference.decode(plain(bytes))));
    const ours = outcome(() => decodeFeedMessage(plain(bytes)));
    stats.cases += 1;
    if (JSON.stringify(theirs) !== JSON.stringify(ours)) {
      stats.mismatches += 1;
      if (stats.mismatches <= 5) console.log("MISMATCH", Buffer.from(bytes).toString("base64").slice(0, 300), JSON.stringify(theirs).slice(0, 300), JSON.stringify(ours).slice(0, 300));
    } else if ("ok" in theirs) stats.bothOk += 1;
    else stats.bothError += 1;
  };
  for (const feed of real) check(feed);
  for (let i = 0; i < rounds; i += 1) {
    noise = pick([0, 0, 0, 0.002, 0.01, 0.05]);
    const feed = generate();
    check(feed);
    check(mutate(feed));
    check(mutate(pick(real)));
    if (i % 4 === 0) {
      const second = generate();
      const both = new Uint8Array(feed.length + second.length);
      both.set(feed);
      both.set(second, feed.length);
      check(both);
    }
  }
  console.log(JSON.stringify(stats));
  return stats.mismatches;
}

/** Hand-written edge cases: each pins down one rule of protobuf.js's decoding. */
function edgeCases(): Array<{ name: string; bytes: number[] }> {
  const num = (f: number, n: bigint) => [...key(f, 0), ...varint(n)];
  const str = (f: number, s: string | number[]) => delimited(f, typeof s === "string" ? [...Buffer.from(s)] : s);
  const header = (ts: bigint | null = BigInt(1_786_000_000)) => delimited(1, [...str(1, "2.0"), ...(ts === null ? [] : num(3, ts))]);
  const stu = (stop: string | number[], arrival?: bigint, departure?: bigint) =>
    delimited(2, [
      ...(arrival !== undefined ? delimited(2, num(2, arrival)) : []),
      ...(departure !== undefined ? delimited(3, num(2, departure)) : []),
      ...str(4, stop),
    ]);
  const trip = [...str(1, "t1"), ...str(5, "1")];
  const tripUpdate = (...stus: number[][]) => delimited(3, [...delimited(1, trip), ...stus.flat()]);
  const entity = (id: string, ...fields: number[][]) => delimited(2, [...str(1, id), ...fields.flat()]);
  const extension = delimited(1001, num(1, BigInt(1)));
  const withStop = (stop: string | number[], time = BigInt(1)) => [...header(), ...entity("e", tripUpdate(stu(stop, time)))];
  return [
    { name: "empty input: missing required header", bytes: [] },
    { name: "header only", bytes: header() },
    { name: "header without version", bytes: delimited(1, num(3, BigInt(5))) },
    { name: "header without timestamp", bytes: header(null) },
    { name: "uint64 timestamp above 2^53", bytes: header((BigInt(1) << BigInt(60)) + BigInt(12345)) },
    { name: "uint64 timestamp at 2^64-1", bytes: header((BigInt(1) << BigInt(64)) - BigInt(1)) },
    { name: "one trip with arrival and departure", bytes: [...header(), ...entity("e", tripUpdate(stu("128N", BigInt(1_786_000_100), BigInt(1_786_000_200)), stu("101N", BigInt(1_786_001_000))))] },
    { name: "negative int64 time", bytes: withStop("A", -BigInt(5)) },
    { name: "int64 time beyond 2^53", bytes: withStop("A", (BigInt(1) << BigInt(62)) + BigInt(7)) },
    { name: "entity without id", bytes: [...header(), ...delimited(2, tripUpdate(stu("A", BigInt(1))))] },
    { name: "trip update without trip", bytes: [...header(), ...entity("e", delimited(3, stu("A", BigInt(1))))] },
    { name: "trip update twice: merged, trip from the first", bytes: [...header(), ...entity("e", tripUpdate(stu("A", BigInt(1))), delimited(3, stu("B", BigInt(2))))] },
    { name: "header twice: merged", bytes: [...header(), ...delimited(1, num(3, BigInt(99)))] },
    { name: "departure twice: merged", bytes: [...header(), ...entity("e", delimited(3, [...delimited(1, trip), ...delimited(2, [...delimited(3, num(2, BigInt(5))), ...delimited(3, num(1, BigInt(1))), ...str(4, "A")])]))] },
    { name: "NYCT extension fields are skipped", bytes: [...header(), ...entity("e", delimited(3, [...delimited(1, [...trip, ...extension]), ...delimited(2, [...str(4, "A"), ...extension])]))] },
    { name: "vehicle position with its required fields", bytes: [...header(), ...entity("v", delimited(4, delimited(2, [...key(1, 5), 0, 0, 128, 63, ...key(2, 5), 0, 0, 0, 64])))] },
    { name: "vehicle position missing latitude", bytes: [...header(), ...entity("v", delimited(4, delimited(2, [...key(2, 5), 0, 0, 0, 64])))] },
    { name: "position twice in a vehicle: required fields merge", bytes: [...header(), ...entity("v", delimited(4, [...delimited(2, [...key(1, 5), 1, 2, 3, 4, ...key(2, 5), 1, 2, 3, 4]), ...delimited(2, [...key(3, 5), 1, 2, 3, 4])]))] },
    { name: "alert translation missing text", bytes: [...header(), ...entity("a", delimited(5, delimited(10, delimited(1, str(2, "en")))))] },
    { name: "alert image missing media type", bytes: [...header(), ...entity("a", delimited(5, delimited(15, delimited(1, str(1, "https://x")))))] },
    { name: "field number 0", bytes: [...header(), 0x00, 0x01] },
    { name: "wire type 3 group, skipped", bytes: [...header(), ...key(9, 3), ...num(1, BigInt(7)), ...key(9, 4)] },
    { name: "group with mismatched end tag", bytes: [...header(), ...key(9, 3), ...num(1, BigInt(7)), ...key(10, 4)] },
    { name: "group never ended", bytes: [...header(), ...key(9, 3), ...num(1, BigInt(7))] },
    { name: "groups nested past the depth limit", bytes: [...header(), ...Array.from({ length: 102 }, (_, i) => key(9 + (i % 3), 3)).flat()] },
    { name: "wire type 4 at top level", bytes: [...header(), ...key(9, 4)] },
    { name: "wire type 6", bytes: [...header(), ...key(9, 6), 1] },
    { name: "wire type 7", bytes: [...header(), ...key(9, 7), 1] },
    { name: "known field with the wrong wire type is skipped", bytes: [...header(), ...num(2, BigInt(5))] },
    { name: "tag longer than 32 bits", bytes: [...header(), 0x80, 0x80, 0x80, 0x80, 0x10] },
    { name: "varint of 11 bytes", bytes: [...header(), ...key(9, 0), ...Array(10).fill(0xff), 0x01] },
    { name: "length 2^32 truncates to 0", bytes: [...header(), ...key(9, 2), 0x80, 0x80, 0x80, 0x80, 0x10] },
    { name: "nested message longer than the buffer", bytes: [...header(), ...key(2, 2), 0x7f, ...str(1, "e")] },
    { name: "string longer than the buffer", bytes: [...header(), ...key(9, 2), 0x20, 0x41] },
    { name: "string runs past its enclosing message", bytes: [...header(), ...key(2, 2), 0x02, ...key(1, 2), 0x03, 0x41, 0x42, 0x43] },
    { name: "truncated after a tag", bytes: [...header(), ...key(2, 2)] },
    { name: "stop id: overlong 2-byte UTF-8", bytes: withStop([0xc1, 0x81]) },
    { name: "stop id: lead byte cut off reads past the string", bytes: withStop([0x41, 0xe2]) },
    { name: "stop id: 4-byte sequence above U+10FFFF", bytes: withStop([0xf7, 0xbf, 0xbf, 0xbf]) },
    { name: "stop id: stray continuation bytes", bytes: withStop([0x41, 0x80, 0xbf, 0x42]) },
    { name: "stop id: emoji", bytes: withStop("🚇") },
    { name: "stop id: 64 bytes of invalid UTF-8 (TextDecoder path)", bytes: withStop(Array(64).fill(0xff)) },
    { name: "stop id: 63 bytes of invalid UTF-8 (hand-decoded path)", bytes: withStop(Array(63).fill(0xff)) },
  ];
}

function corpus(reference: ReturnType<typeof loadReference>) {
  const generate = generator(generatedSchema(reference.source));
  const cases: Array<{ name: string; input?: string; file?: string; expect: object }> = [];
  const add = (name: string, bytes: Uint8Array, file?: string) => {
    const theirs = outcome(() => project(reference.decode(plain(bytes))));
    const ours = outcome(() => decodeFeedMessage(plain(bytes)));
    if (JSON.stringify(theirs) !== JSON.stringify(ours)) throw new Error(`Decoders disagree on ${name}`);
    const json = "ok" in theirs ? JSON.stringify(theirs.ok) : "";
    const expect = "ok" in theirs && json.length > 400 ? { okSha256: createHash("sha256").update(json).digest("hex") } : theirs;
    cases.push({ name, ...(file ? { file } : { input: Buffer.from(bytes).toString("base64") }), expect });
  };
  const edges = edgeCases();
  for (const { name, bytes } of edges) add(name, Uint8Array.from(bytes));
  // A sample of small fuzz inputs: successes, and a few of each kind of error.
  const kinds = new Map<string, number>();
  let successes = 0;
  for (let i = 0; cases.length < edges.length + 120 && i < 200_000; i += 1) {
    noise = pick([0, 0.01, 0.05]);
    const generated = generate();
    const bytes = i % 2 ? mutate(generated) : generated;
    if (bytes.length > 200) continue;
    const theirs = outcome(() => project(reference.decode(plain(bytes))));
    const kind = "error" in theirs ? theirs.error.message.replace(/\d+/g, "N") : "ok";
    if (kind === "ok" ? successes >= 40 : (kinds.get(kind) ?? 0) >= 6) continue;
    if (kind === "ok") {
      if ((theirs as { ok: { entity: unknown[] } }).ok.entity.length === 0 && int(4)) continue;
      successes += 1;
    } else kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    add(`fuzz ${kind}`, bytes);
  }
  for (const file of FIXTURES) add(`captured MTA feed ${file}`, new Uint8Array(readFileSync(`tests/fixtures/${file}`)), file);
  writeFileSync(CORPUS, JSON.stringify({ generatedBy: "protobuf.js 8.7.1 via gtfs-realtime-bindings 2.2.0", cases }, null, 1) + "\n");
  console.log(`${CORPUS}: ${cases.length} cases`);
}

/** One decoder in this process: per-iteration milliseconds for decoding every feed, by batch. */
function benchWorker(reference: ReturnType<typeof loadReference> | null, feedsFile: string) {
  const feeds = (JSON.parse(readFileSync(feedsFile, "utf8")) as string[]).map((b) => new Uint8Array(Buffer.from(b, "base64")));
  let checksum = 0;
  const once = () => {
    for (const bytes of feeds) {
      const feed = reference ? reference.decode(bytes) : decodeFeedMessage(bytes);
      checksum += seconds(feed.header.timestamp) ?? 0;
      for (const { tripUpdate } of feed.entity) {
        for (const u of tripUpdate?.stopTimeUpdate ?? []) checksum += (seconds(u.arrival?.time) ?? 0) + u.stopId.length;
      }
    }
  };
  for (let i = 0; i < 300; i += 1) once();
  const times: number[] = [];
  for (let batch = 0; batch < 40; batch += 1) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < 25; i += 1) once();
    times.push(Number(process.hrtime.bigint() - start) / 1e6 / 25);
  }
  console.log(JSON.stringify({ times, checksum }));
}

async function bench(directory: string, runs: number) {
  const feedsFile = path.join(directory, "bench-feeds.json");
  writeFileSync(feedsFile, JSON.stringify((await liveFeeds()).map((b) => Buffer.from(b).toString("base64"))));
  const results: Record<string, { times: number[]; checksums: Set<number> }> = { "protobuf.js": { times: [], checksums: new Set() }, ours: { times: [], checksums: new Set() } };
  for (let run = 0; run < runs; run += 1) {
    // Alternate which goes first; each run is a fresh process, so neither shares a JIT with the other.
    for (const name of run % 2 ? ["ours", "protobuf.js"] : ["protobuf.js", "ours"]) {
      const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1]!, "bench-worker", name === "ours" ? "-" : directory, feedsFile], { encoding: "utf8" });
      if (child.status !== 0) throw new Error(child.stderr);
      const { times, checksum } = JSON.parse(child.stdout) as { times: number[]; checksum: number };
      results[name]!.times.push(...times);
      results[name]!.checksums.add(checksum);
    }
  }
  const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.floor(q * (values.length - 1))]!;
  for (const [name, { times, checksums }] of Object.entries(results)) {
    console.log(`${name.padEnd(12)} median ${quantile(times, 0.5).toFixed(2)} ms  p10 ${quantile(times, 0.1).toFixed(2)}  p90 ${quantile(times, 0.9).toFixed(2)}  (decoding all ${MTA_FEEDS.length} feeds; ${times.length} batches${checksums.size === 1 ? "" : "; CHECKSUMS DIFFER"})`);
  }
  const [a, b] = Object.values(results);
  if ([...a!.checksums][0] !== [...b!.checksums][0]) throw new Error("The decoders produced different results");
}

const [command, directory, ...rest] = process.argv.slice(2);
if (!command || !directory) {
  console.log("Usage: npx tsx scripts/gtfs-realtime-parity.mts <schema|fuzz|corpus|bench> <reference directory> [args]");
  process.exit(1);
}
if (command === "bench-worker") {
  benchWorker(directory === "-" ? null : loadReference(directory), rest[0]!);
} else {
  const reference = loadReference(directory);
  if (command === "schema") process.exitCode = checkSchema(generatedSchema(reference.source)) ? 1 : 0;
  else if (command === "fuzz") {
    seed = Number(rest[1] ?? 1);
    process.exitCode = (await fuzz(reference, Number(rest[0] ?? 2_000))) ? 1 : 0;
  } else if (command === "corpus") corpus(reference);
  else if (command === "bench") await bench(directory, Number(rest[0] ?? 8));
  else throw new Error(`Unknown command ${command}`);
}
