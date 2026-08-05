"use client";

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
  if (options.length < 2) return null;

  return (
    <fieldset className="border-b border-edge bg-surface px-5 py-3">
      <legend className="text-sm font-semibold">Filter by destination</legend>
      {selected.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 text-sm font-medium text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          Clear destination filter
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((destination) => {
          const checked = selected.has(destination.id);
          return (
            <label
              key={destination.id}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${checked ? "border-text bg-text text-surface" : "border-edge text-text hover:bg-bg"}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                aria-checked={checked}
                onChange={() => onToggle(destination.id)}
              />
              {destination.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
