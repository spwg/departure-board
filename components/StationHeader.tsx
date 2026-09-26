import Link from "next/link";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SettingsButton } from "@/components/SettingsButton";
import type { BoardChoice } from "@/lib/boardChoices";

/**
 * The header's fixed height. Direction headings pin directly beneath it on
 * phones, so the header must not grow with its content — a taller header
 * would leave rows showing through the gap, a shorter one would overlap them.
 */
export const STATION_HEADER_HEIGHT = "4rem";

/**
 * One station's header: a way Home, the station's name with the routes that
 * serve it, and the station's own controls. `titleHref` links the name back to
 * the station's main board from one of its sub-pages.
 */
export function StationHeader({
  name,
  titleHref,
  routes,
  choice,
  favoriteName,
}: {
  name: string;
  titleHref?: string;
  routes: React.ReactNode;
  choice: BoardChoice;
  favoriteName: string;
}) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface px-2 sm:static sm:px-3"
      style={{ height: STATION_HEADER_HEIGHT }}
    >
      <HomeButton />
      <div className="min-w-0 flex-1 px-1">
        <h1 className="truncate text-base font-semibold leading-6">
          {titleHref ? (
            <Link
              href={titleHref}
              className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {name}
            </Link>
          ) : name}
        </h1>
        <div className="mt-0.5 flex min-w-0 items-center overflow-hidden">{routes}</div>
      </div>
      <SettingsButton />
      <FavoriteButton choice={choice} name={favoriteName} />
    </header>
  );
}

/** Returns to Home, where search and Favorites live. */
export function HomeButton() {
  return (
    <Link
      href="/"
      aria-label="Home"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
      </svg>
    </Link>
  );
}
