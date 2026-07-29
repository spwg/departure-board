import Link from "next/link";
import { formatClock, type Departure } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import { lineColor, lineName } from "@/lib/stations";
import { WatchButton } from "./WatchButton";

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

/** Renders one normalized departure, counting down to its expected (not scheduled) departure time. */
export function DepartureRow({
  departure,
  now,
  stationCode,
}: {
  departure: Departure;
  now: number;
  stationCode: string;
}) {
  const { use24Hour } = useClockFormat();
  // Late trains leave late, so count down to when it will actually go.
  const expected = new Date(departure.expectedTime).getTime();
  const minutesAway = Math.round((expected - now) / 60_000);

  const cancelled = departure.status === "cancelled";
  const boarding = departure.status === "boarding";
  const delayed = departure.delayMinutes >= 1;
  // Most labels are a number or a single letter. "Single" is a real NJT
  // platform label, so it needs a wider chip instead of being clipped.
  const namedTrack = departure.track.length > 2;

  return (
    <li className={`relative flex items-center ${cancelled ? "opacity-55" : ""}`}>
      <span
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
        style={{ backgroundColor: lineColor(departure.lineCode) }}
      />

      {/* The whole row is the target: on a platform you are tapping this with
          a thumb, in a hurry. Deliberately no aria-label — the row's own
          contents make a better accessible name than a summary would. */}
      <Link
        href={`/train/${encodeURIComponent(departure.trainNumber)}?from=${stationCode}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 pr-3 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none sm:gap-4 sm:pl-5"
      >
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
                  {formatClock(departure.scheduledTime, { hour12: !use24Hour })}
                </span>{" "}
                <span className="font-medium text-warn">
                  {formatClock(departure.expectedTime, { hour12: !use24Hour })}
                </span>
              </>
            ) : (
              formatClock(departure.scheduledTime, { hour12: !use24Hour })
            )}
          </div>
        </div>

        {/* Track is what you actually run for, so it gets its own anchor. */}
        <div
          className={`flex h-11 shrink-0 items-center justify-center rounded-xl font-bold ${
            namedTrack
              ? "min-w-16 px-2 text-sm sm:h-12 sm:min-w-20 sm:text-base"
              : "w-11 text-lg sm:h-12 sm:w-12 sm:text-xl"
          } ${
            departure.track
              ? "bg-track text-track-fg"
              : "border border-dashed border-edge-strong text-faint"
          }`}
          aria-label={
            departure.track
              ? namedTrack
                ? `${departure.track} track`
                : `Track ${departure.track}`
              : "Track not yet assigned"
          }
        >
          {departure.track || "–"}
        </div>

        <span className="sr-only">See stops</span>
      </Link>
      <WatchButton stationCode={stationCode} departure={departure} />
    </li>
  );
}
