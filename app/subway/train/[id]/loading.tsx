import { HomeButton, STATION_HEADER_HEIGHT } from "@/components/StationHeader";
import { SettingsButton } from "@/components/SettingsButton";

/**
 * Also the Suspense boundary the page needs: the trip identity and the board
 * that linked here are both request-time values, which Cache Components
 * requires be read below a fallback.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header
          className="flex items-center gap-1 border-b border-edge px-2 sm:px-3"
          style={{ height: STATION_HEADER_HEIGHT }}
        >
          <HomeButton />
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1" aria-hidden>
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-edge" />
            <div className="h-5 w-40 animate-pulse rounded bg-edge" />
          </div>
          <SettingsButton />
        </header>

        <ul className="py-1" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5 pl-4 pr-3 sm:pl-5">
              <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-edge" />
              <div
                className="h-4 flex-1 animate-pulse rounded bg-edge"
                style={{ maxWidth: `${45 + ((i * 13) % 30)}%` }}
              />
              <div className="h-4 w-12 shrink-0 animate-pulse rounded bg-edge" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
