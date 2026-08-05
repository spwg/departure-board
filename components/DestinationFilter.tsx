"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DESTINATION_PARAM = "destination";
export type DestinationOption = { id: string; label: string };

export function useDestinationFilter(
  destinations: DestinationOption[],
  isProviderDestinationId: (id: string) => boolean = () => false,
) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const options = [...new Map(destinations.map((destination) => [destination.id, destination])).values()];
  const available = new Set(options.map((option) => option.id));
  const selected = new Set(
    searchParams
      .getAll(DESTINATION_PARAM)
      .filter((destination) => available.has(destination) || isProviderDestinationId(destination)),
  );

  const replaceSelection = (next: Set<string>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DESTINATION_PARAM);
    for (const destination of next) {
      if (available.has(destination) || isProviderDestinationId(destination)) {
        params.append(DESTINATION_PARAM, destination);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return {
    options,
    selected,
    matches: (destination: DestinationOption) => selected.size === 0 || selected.has(destination.id),
    toggle: (destination: string) => {
      const next = new Set(selected);
      if (next.has(destination)) next.delete(destination);
      else next.add(destination);
      replaceSelection(next);
    },
    clear: () => replaceSelection(new Set()),
  };
}

export function DestinationFilter({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: DestinationOption[];
  selected: Set<string>;
  onToggle: (destination: string) => void;
  onClear: () => void;
}) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? selected.size > 0;
  if (options.length < 2) return null;

  return (
    <div className="border-b border-edge bg-surface px-5 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpenOverride(!open)}
        className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>{open ? "⌃" : "⌄"}</span>
          Filter destinations
        </span>
        <span className="text-xs font-medium text-muted">
          {selected.size === 0 ? "All destinations" : `${selected.size} selected`}
        </span>
      </button>
      {open && (
        <fieldset className="mt-2 rounded-lg border border-edge p-2">
          <legend className="sr-only">Destinations</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {options.map((destination) => {
              const checked = selected.has(destination.id);
              return (
                <label
                  key={destination.id}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-text hover:bg-bg"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-checked={checked}
                    onChange={() => onToggle(destination.id)}
                    className="h-4 w-4 shrink-0 accent-text"
                  />
                  <span className="truncate">{destination.label}</span>
                </label>
              );
            })}
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 px-2 py-1 text-sm font-medium text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              Clear filter
            </button>
          )}
        </fieldset>
      )}
    </div>
  );
}
