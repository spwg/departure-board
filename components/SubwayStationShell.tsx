import type { CSSProperties } from "react";
import { Breadcrumbs, type BreadcrumbParent } from "@/components/Breadcrumbs";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SettingsButton } from "@/components/SettingsButton";
import type { BoardChoice } from "@/lib/boardChoices";

/** Shared station shell for the full Subway board and its direction pages. */
export function SubwayStationShell({
  stationName,
  routes,
  choice,
  favoriteName,
  breadcrumbParents = [{ label: "Stations", href: "/" }],
  breadcrumbCurrent = stationName,
  breadcrumbSubtitle = `${routes.join(" · ")} Subway`,
  children,
}: {
  stationName: string;
  routes: string[];
  choice: BoardChoice;
  favoriteName: string;
  breadcrumbParents?: BreadcrumbParent[];
  breadcrumbCurrent?: string;
  breadcrumbSubtitle?: string | null;
  children: React.ReactNode;
}) {
  const boardShellStyle = { "--subway-header-offset": "4.625rem" } as CSSProperties;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      {/* `overflow-clip` rather than `overflow-hidden`: both round off the
          card's corners, but only clip leaves the page as the scrollport, so
          the pinned header and direction headings inside actually pin. */}
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm" style={boardShellStyle}>
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-edge bg-surface/85 px-2 py-2.5 backdrop-blur-md sm:static sm:px-3">
          <Breadcrumbs
            parents={breadcrumbParents}
            current={breadcrumbCurrent}
            subtitle={breadcrumbSubtitle}
          />
          <SettingsButton />
          <FavoriteButton choice={choice} name={favoriteName} />
        </header>
        {children}
      </div>
    </main>
  );
}
