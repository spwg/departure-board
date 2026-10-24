/**
 * Encodes test feeds in GTFS-Realtime's protobuf wire format: just the fields
 * lib/gtfsRealtime decodes, plus the header version and entity id a real feed
 * carries. Field numbers are the official gtfs-realtime.proto's.
 */

type TestStopTimeUpdate = { stopId?: string; arrival?: { time: number }; departure?: { time: number } };
type TestEntity = {
  id: string;
  tripUpdate?: { trip: { tripId?: string; routeId?: string }; stopTimeUpdate?: TestStopTimeUpdate[] };
};
export type TestFeed = { header: { gtfsRealtimeVersion: string; timestamp?: number }; entity: TestEntity[] };

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}

const key = (field: number, wireType: number) => varint(field * 8 + wireType);
const number = (field: number, value: number) => [...key(field, 0), ...varint(value)];
const bytes = (field: number, content: number[]) => [...key(field, 2), ...varint(content.length), ...content];
const string = (field: number, value: string) => bytes(field, [...new TextEncoder().encode(value)]);

function stopTimeUpdate({ stopId, arrival, departure }: TestStopTimeUpdate): number[] {
  return [
    ...(arrival ? bytes(2, number(2, arrival.time)) : []),
    ...(departure ? bytes(3, number(2, departure.time)) : []),
    ...(stopId !== undefined ? string(4, stopId) : []),
  ];
}

function entity({ id, tripUpdate }: TestEntity): number[] {
  if (!tripUpdate) return string(1, id);
  const { trip, stopTimeUpdate: calls = [] } = tripUpdate;
  const descriptor = [
    ...(trip.tripId !== undefined ? string(1, trip.tripId) : []),
    ...(trip.routeId !== undefined ? string(5, trip.routeId) : []),
  ];
  return [
    ...string(1, id),
    ...bytes(3, [...bytes(1, descriptor), ...calls.flatMap((call) => bytes(2, stopTimeUpdate(call)))]),
  ];
}

export function encodeFeed({ header, entity: entities }: TestFeed): Uint8Array {
  return Uint8Array.from([
    ...bytes(1, [
      ...string(1, header.gtfsRealtimeVersion),
      ...(header.timestamp !== undefined ? number(3, header.timestamp) : []),
    ]),
    ...entities.flatMap((item) => bytes(2, entity(item))),
  ]);
}
