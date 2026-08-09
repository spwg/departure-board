import { BoardMenu } from "@/components/BoardMenu";
import { FavoriteButton } from "@/components/FavoriteButton";
import type { BoardChoice } from "@/lib/boardChoices";

/** Shared station shell for the full Subway board and its direction pages. */
export function SubwayStationShell({
  stationName,
  routes,
  choice,
  favoriteName,
  children,
}: {
  stationName: string;
  routes: string[];
  choice: BoardChoice;
  favoriteName: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      {/* `overflow-clip` rather than `overflow-hidden`: both round off the
          card's corners, but only clip leaves the page as the scrollport, so
          the pinned header and direction headings inside actually pin. */}
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <BoardMenu />
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-base font-semibold sm:text-lg">{stationName}</h1>
            <p className="text-xs text-muted">{routes.join(" · ")} Subway</p>
          </div>
          <FavoriteButton choice={choice} name={favoriteName} />
        </header>
        {children}
      </div>
    </main>
  );
}
