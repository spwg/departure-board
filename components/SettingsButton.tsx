"use client";

import { useEffect, useRef, useState } from "react";
import { useClockFormat } from "@/lib/clockFormat";

/** A compact home for preferences that should not compete with board controls. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { use24Hour, setClockFormat, loaded } = useClockFormat();

  useEffect(() => {
    if (!open) return;

    const dismissWhenOutside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismissWhenOutside);
    return () => document.removeEventListener("pointerdown", dismissWhenOutside);
  }, [open]);

  return (
    <div ref={settingsRef} className="relative shrink-0" style={{ visibility: loaded ? "visible" : "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="board-settings"
        aria-label="Settings"
        className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="currentColor"
          aria-hidden
        >
          <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.3 7.3 0 00-1.69-.98L14.5 2.42A.5.5 0 0014 2h-4a.5.5 0 00-.49.42l-.38 2.65c-.61.25-1.18.59-1.69.98l-2.49-1a.5.5 0 00-.61.22l-2 3.46a.5.5 0 00.12.64L4.57 11c-.04.32-.07.65-.07.98s.03.66.08.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.13.22.39.31.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.18-.59 1.69-.98l2.49 1c.22.09.48 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.09-1.65zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
        </svg>
      </button>

      {open && (
        <section
          id="board-settings"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-72 rounded-xl border border-edge bg-surface p-4 shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id="settings-title" className="text-sm font-semibold">Settings</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="border-t border-edge pt-4">
            <p className="text-sm font-medium">Time format</p>
            <p className="mt-1 text-xs leading-5 text-muted">Choose how scheduled departure times are shown.</p>
            <div role="radiogroup" aria-label="Time format" className="mt-3 grid grid-cols-2 rounded-lg bg-bg p-1">
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
                    className={`rounded-md px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${selected ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
                  >
                    <span className="block text-xs font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted">{option.example}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
