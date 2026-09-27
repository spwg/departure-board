"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PageTitle } from "@/components/PageTitle";
import { HomeButton } from "@/components/StationHeader";
import { useClockFormat } from "@/lib/clockFormat";
import { useShowNearby } from "@/lib/nearbyPreference";
import { useThemePreference } from "@/lib/themePreference";

/** Full-page preferences so settings never compete with board overlays. */
export function SettingsPage() {
  const { use24Hour, setClockFormat } = useClockFormat();
  const { theme, setTheme } = useThemePreference();
  const { showNearby, setShowNearby } = useShowNearby();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <PageHeader>
          <HomeButton />
          <PageTitle title="Settings" />
        </PageHeader>

        <div className="space-y-6 p-4 sm:p-5">
          <section aria-labelledby="time-format-title" className="rounded-xl border border-edge bg-surface-raised p-4">
            <h2 id="time-format-title" className="text-base font-semibold">Time format</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Choose how scheduled departure times are shown.
            </p>

            <SegmentedControl
              label="Time format"
              value={use24Hour}
              onChange={setClockFormat}
              options={[
                { label: "12-hour", value: false, example: "7:05 PM" },
                { label: "24-hour", value: true, example: "19:05" },
              ]}
            />
          </section>

          <section aria-labelledby="appearance-title" className="rounded-xl border border-edge bg-surface-raised p-4">
            <h2 id="appearance-title" className="text-base font-semibold">Appearance</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Choose light or dark, or follow this device’s setting.
            </p>

            <SegmentedControl
              label="Appearance"
              value={theme}
              onChange={setTheme}
              options={[
                { label: "System", value: "system" },
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
              ]}
            />
          </section>

          <section aria-labelledby="nearby-title" className="rounded-xl border border-edge bg-surface-raised p-4">
            <h2 id="nearby-title" className="text-base font-semibold">Nearby stations</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Choose whether Home lists stations near you.
            </p>

            <SegmentedControl
              label="Nearby stations"
              value={showNearby}
              onChange={setShowNearby}
              options={[
                { label: "Show", value: true },
                { label: "Hide", value: false },
              ]}
            />
          </section>

          <section aria-labelledby="about-title" className="rounded-xl border border-edge bg-surface-raised p-4">
            <h2 id="about-title" className="text-base font-semibold">About</h2>
            <Link
              href="/about"
              className="mt-2 inline-flex text-sm font-medium text-muted underline underline-offset-4 transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              About data
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function SegmentedControl<T>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { label: string; value: T; example?: string }[];
}) {
  const selectedIndex = options.findIndex((option) => option.value === value);

  // Standard radio-group keys: arrows move and select, and only the checked
  // option is in the tab order.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onChange(options[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="mt-4 grid auto-cols-fr grid-flow-col rounded-lg bg-bg p-1"
    >
      {options.map((option, index) => {
        const selected = value === option.value;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === Math.max(selectedIndex, 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${selected ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            {option.example && (
              <span className="mt-0.5 block text-sm tabular-nums text-muted">{option.example}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
