import { NJT_TIME_ZONE, type Departure } from "@/lib/departures";
import { lineColor, lineName } from "@/lib/stations";

/** Tested contract: each row exposes train, line, timetable, operational state, and track. */

/**
 * Formats the wait as something you can read at a glance while walking.
 * Anything past an hour becomes "1h 20m" rather than "80 min".
 */
function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Always Eastern, not the viewer's zone, so the board matches the clock at the
 * station. Checking New York departures from another timezone should not shift
 * every time on the page.
 */
function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: NJT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DepartureRow({
  departure,
  now,
}: {
  departure: Departure;
  now: number;
}) {
  // Late trains leave late, so count down to when it will actually go.
  const expected = new Date(departure.expectedTime).getTime();
  const minutesAway = Math.round((expected - now) / 60_000);

  const cancelled = departure.status === "cancelled";
  const boarding = departure.status === "boarding";
  const delayed = departure.delayMinutes >= 1;

  return (
    <li
      className={`relative flex items-center gap-3 py-4 pl-4 pr-3 sm:gap-4 sm:pl-5 ${
        cancelled ? "opacity-55" : ""
      }`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
        style={{ backgroundColor: lineColor(departure.lineCode) }}
      />

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-lg font-semibold tracking-tight sm:text-xl ${
            cancelled ? "line-through decoration-2" : ""
          }`}
        >
          {departure.destination}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted sm:text-sm">
          <span className="truncate">{lineName(departure.lineCode)}</span>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <span className="shrink-0 font-mono">#{departure.trainNumber}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        {cancelled ? (
          <div className="text-sm font-semibold uppercase tracking-wide text-danger">
            Cancelled
          </div>
        ) : (
          <div
            className={`text-lg font-semibold sm:text-xl ${
              boarding ? "text-ok" : delayed ? "text-warn" : "text-text"
            }`}
          >
            {boarding ? "Boarding" : formatCountdown(minutesAway)}
          </div>
        )}

        <div className="mt-0.5 text-xs text-muted sm:text-sm">
          {delayed && !cancelled ? (
            <>
              <span className="line-through">
                {formatClock(departure.scheduledTime)}
              </span>{" "}
              <span className="font-medium text-warn">
                {formatClock(departure.expectedTime)}
              </span>
            </>
          ) : (
            formatClock(departure.scheduledTime)
          )}
        </div>
      </div>

      {/* Track is what you actually run for, so it gets its own anchor. */}
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold sm:h-12 sm:w-12 sm:text-xl ${
          departure.track
            ? "bg-track text-track-fg"
            : "border border-dashed border-edge-strong text-faint"
        }`}
        aria-label={
          departure.track ? `Track ${departure.track}` : "Track not yet assigned"
        }
      >
        {departure.track || "–"}
      </div>
    </li>
  );
}
