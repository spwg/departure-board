"use client";

import { useFavorites } from "@/lib/favorites";


/** Toggles `code`; the pressed state and accessible label reflect the resulting favourite state. */
export function FavoriteButton({
  code,
  name,
  className = "",
}: {
  code: string;
  name: string;
  className?: string;
}) {
  const { isFavorite, toggle, loaded } = useFavorites();
  const active = isFavorite(code);

  return (
    <button
      type="button"
      onClick={() => toggle(code)}
      aria-pressed={active}
      aria-label={
        active ? `Remove ${name} from favorites` : `Add ${name} to favorites`
      }
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        // Filled once starred; outlined until then. Hidden before storage is
        // read so it cannot flash the wrong state on load.
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          color: active ? "#f59e0b" : undefined,
          visibility: loaded ? "visible" : "hidden",
        }}
        aria-hidden
      >
        <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" />
      </svg>
    </button>
  );
}
