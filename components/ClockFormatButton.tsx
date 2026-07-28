"use client";

import { useClockFormat } from "@/lib/clockFormat";

/** Lets a rider explicitly choose a clock format when browser defaults differ from macOS. */
export function ClockFormatButton() {
  const { use24Hour, toggle, loaded } = useClockFormat();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={use24Hour}
      aria-label={use24Hour ? "Use 12-hour time" : "Use 24-hour time"}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      style={{ visibility: loaded ? "visible" : "hidden" }}
    >
      24
    </button>
  );
}
