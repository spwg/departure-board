import Link from "next/link";
import { formatClock, type Departure } from "@/lib/departures";
import { useClockFormat } from "@/lib/clockFormat";
import { lineColor, lineName } from "@/lib/stations";
import { confidencePercent } from "@/lib/trainPositions";

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
  showViaSecaucus = false,
}: {
  departure: Departure;
  now: number;
  stationCode: string;
  showViaSecaucus?: boolean;
}) {
  const { use24Hour } = useClockFormat();
  // Late trains leave late, so count down to when it will actually go.
  const expected = new Date(departure.expectedTime).getTime();
  const minutesAway = Math.round((expected - now) / 60_000);

  const cancelled = departure.status === "cancelled";
  const boarding = departure.status === "boarding";
  const delayed = departure.delayMinutes >= 1;

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
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none sm:gap-4 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`min-w-0 text-lg font-semibold leading-6 tracking-tight break-words sm:text-xl ${
                cancelled ? "line-through decoration-2" : ""
              }`}
            >
              {departure.destination}
            </div>
            {departure.servesNewarkAirport && (
              <span
                className="shrink-0 rounded bg-bg px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text"
                aria-label="Serves Newark Airport"
              >
                Airport service
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted sm:text-sm">
            <span>{lineName(departure.lineCode)}</span>
            {/* The separator travels with the number when the line wraps. */}
            <span className="whitespace-nowrap">
              <span aria-hidden className="mr-1.5 text-faint">·</span>
              <span className="font-mono">#{departure.trainNumber}</span>
            </span>
            {showViaSecaucus && (
              <>
                <span aria-hidden className="text-faint">·</span>
                <span className="shrink-0">via Secaucus</span>
              </>
            )}
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
                {/* Stacked on phones so the times column stays narrow. */}
                <span className="block line-through sm:inline">
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
        <TrackChip
          track={departure.track}
          predictedTrack={departure.position?.predictedTrack}
          confidence={departure.position?.confidence}
        />

        <span className="sr-only">See stops</span>
      </Link>
    </li>
  );
}

/**
 * A posted track is a solid green chip. A predicted track — the platform the
 * train's current signal circuit has most often led to in position history —
 * is grey and captioned with its confidence, so it never reads as the official
 * assignment.
 */
function TrackChip({
  track,
  predictedTrack,
  confidence,
}: {
  track: string;
  predictedTrack?: string;
  confidence?: number;
}) {
  const predicted = !track && predictedTrack ? predictedTrack : "";
  const percent = predicted && confidence !== undefined ? confidencePercent(confidence) : null;
  const shown = track || predicted;
  // Most labels are a number or a single letter. "Single" is a real NJT
  // platform label, so it needs a wider chip instead of being clipped.
  const namedTrack = shown.length > 2;
  const size = namedTrack
    ? "min-w-16 px-2 text-sm sm:h-12 sm:min-w-20 sm:text-base"
    : "w-11 text-lg sm:h-12 sm:w-12 sm:text-xl";
  const style = track
    ? "bg-track text-track-fg"
    : predicted
      ? "bg-predicted text-predicted-fg"
      : "border border-dashed border-edge-strong text-text";
  const label = track
    ? namedTrack
      ? `${track} track`
      : `Track ${track}`
    : predicted
      ? `Predicted track ${predicted}${percent === null ? "" : `, ${percent}% likely`}, not yet announced`
      : "Track not yet assigned";

  const chip = (
    <div
      className={`flex h-11 shrink-0 items-center justify-center rounded-xl font-bold ${size} ${style}`}
      aria-label={label}
    >
      {shown || "–"}
    </div>
  );

  if (!predicted) return chip;
  // The caption hangs below the chip, outside the layout, so this row's track
  // column stays aligned with every other row's.
  return (
    <div className="relative shrink-0">
      {chip}
      <span aria-hidden className="absolute right-0 top-full mt-1 whitespace-nowrap text-[0.625rem] font-semibold uppercase leading-none tracking-wide text-muted">
        {percent === null ? "Predicted" : `${percent}% likely`}
      </span>
    </div>
  );
}
