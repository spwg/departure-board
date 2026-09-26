"use client";

import { NJT_TIME_ZONE, formatClock } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import type { CircuitSummary, PositionEvent } from "@/lib/trainPositions";

/** How many of the latest pairings across all trains to list. */
const RECENT_LIMIT = 40;

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    timeZone: NJT_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function pairings(count: number): string {
  return count === 1 ? "1 pairing" : `${count} pairings`;
}

/**
 * New York Penn position history: which signal circuit a train stood on while
 * its posted track was known. Times are the departure's timetable time, in
 * Eastern time like the board.
 */
export function PositionHistory({
  train,
  events,
  circuits,
}: {
  train: string;
  events: PositionEvent[];
  circuits: CircuitSummary[];
}) {
  const { use24Hour } = useClockFormat();
  const when = (iso: string) =>
    `${formatDay(iso)} · ${formatClock(iso, { hour12: !use24Hour })}`;

  const own = events.filter((event) => event.trainNumber === train);
  const ownCircuits = new Set(own.map((event) => event.circuit));
  // This train's circuits first, then the rest by how much history they have.
  const orderedCircuits = [
    ...circuits.filter((summary) => ownCircuits.has(summary.circuit)),
    ...circuits.filter((summary) => !ownCircuits.has(summary.circuit)),
  ];

  return (
    <div className="divide-y divide-edge">
      <p className="px-4 py-4 text-sm text-muted sm:px-5">
        Each row pairs the signal circuit a train reported at New York Penn
        with the track NJ Transit posted for it. When a circuit has always led
        to one track, the board shows that track early as{" "}
        <span className="font-semibold text-ok">on platform</span>. Always
        confirm on the station boards.
      </p>

      <Section title={`Train ${train}`}>
        {own.length === 0 ? (
          <Empty>No history for this train yet.</Empty>
        ) : (
          <ul className="divide-y divide-edge">
            {own.map((event) => (
              <EventRow key={`${event.recordedAt}-${event.circuit}`} event={event} when={when} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Signal circuits">
        {orderedCircuits.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ul className="divide-y divide-edge">
            {orderedCircuits.map((summary) => (
              <li key={summary.circuit} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-sm font-semibold">{summary.circuit}</span>
                    {ownCircuits.has(summary.circuit) && (
                      <span className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text">
                        This train
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                    {summary.tracks.map(({ track, count }) => (
                      <span key={track} className="rounded border border-edge px-1.5 py-0.5">
                        Track {track} × {count}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {summary.platform ? (
                    <span className="font-semibold text-ok">Names track {summary.platform}</span>
                  ) : (
                    <span className="text-muted">Not settled</span>
                  )}
                  <div className="mt-0.5 text-faint">{pairings(summary.total)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Latest pairings, all trains">
        {events.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ul className="divide-y divide-edge">
            {events.slice(0, RECENT_LIMIT).map((event) => (
              <EventRow
                key={`${event.recordedAt}-${event.trainNumber}-${event.circuit}`}
                event={event}
                when={when}
                showTrain
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="bg-bg px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted sm:px-5">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted sm:px-5">{children}</p>;
}

function EventRow({
  event,
  when,
  showTrain = false,
}: {
  event: PositionEvent;
  when: (iso: string) => string;
  showTrain?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm">{event.circuit}</div>
        <div className="text-xs text-muted">
          {showTrain && <span className="font-mono">#{event.trainNumber} · </span>}
          {when(event.scheduledTime)}
        </div>
      </div>
      <span aria-hidden className="text-faint">→</span>
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-track text-sm font-bold text-track-fg"
        aria-label={`Posted track ${event.track}`}
      >
        {event.track}
      </div>
    </li>
  );
}
