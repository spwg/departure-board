import type { CSSProperties } from "react";
import { STATION_HEADER_HEIGHT, StationHeader } from "@/components/StationHeader";
import { SubwayRouteIcons } from "@/components/SubwayRouteIcons";
import type { BoardChoice } from "@/lib/boardChoices";

/** Shared station shell for the full Subway board and its direction pages. */
export function SubwayStationShell({
  stationName,
  stationHref,
  routes,
  choice,
  favoriteName,
  children,
}: {
  stationName: string;
  /** Links the header's name back to the station board from a sub-page. */
  stationHref?: string;
  routes: string[];
  choice: BoardChoice;
  favoriteName: string;
  children: React.ReactNode;
}) {
  const boardShellStyle = { "--subway-header-offset": STATION_HEADER_HEIGHT } as CSSProperties;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      {/* `overflow-clip` rather than `overflow-hidden`: both round off the
          card's corners, but only clip leaves the page as the scrollport, so
          the pinned header and direction headings inside actually pin. */}
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm" style={boardShellStyle}>
        <StationHeader
          name={stationName}
          titleHref={stationHref}
          routes={<>
            <SubwayRouteIcons routes={routes} />
            <span className="sr-only">{routes.join(", ")} trains</span>
          </>}
          choice={choice}
          favoriteName={favoriteName}
        />
        {children}
      </div>
    </main>
  );
}
