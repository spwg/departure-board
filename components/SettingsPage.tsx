"use client";

import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useClockFormat } from "@/lib/clockFormat";

/** Full-page preferences so settings never compete with board overlays. */
export function SettingsPage() {
  const { use24Hour, setClockFormat } = useClockFormat();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Breadcrumbs parents={[{ label: "Stations", href: "/" }]} current="Settings" />
        </header>

        <div className="space-y-6 p-4 sm:p-5">
          <section aria-labelledby="time-format-title" className="rounded-xl border border-edge bg-surface-raised p-4">
            <h2 id="time-format-title" className="text-base font-semibold">Time format</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Choose how scheduled departure times are shown.
            </p>

            <div role="radiogroup" aria-label="Time format" className="mt-4 grid grid-cols-2 rounded-lg bg-bg p-1">
              {[
                { label: "12-hour", value: false, example: "7:05 PM" },
                { label: "24-hour", value: true, example: "19:05" },
              ].map((option) => {
                const selected = use24Hour === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setClockFormat(option.value)}
                    className={`rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${selected ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-sm tabular-nums text-muted">{option.example}</span>
                  </button>
                );
              })}
            </div>
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
