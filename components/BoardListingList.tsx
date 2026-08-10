import Link from "next/link";
import { boardChoiceKey } from "@/lib/boardChoices";
import type { BoardListing } from "@/lib/boardDirectory";
import { lineColor } from "@/lib/stations";
import { subwayRouteColor } from "@/lib/subway";

export type BoardListingListItem = {
  listing: BoardListing;
  distanceKm?: number;
};

const KM_PER_MILE = 1.609344;

export function formatDistance(km: number): string {
  const miles = km / KM_PER_MILE;
  return miles < 0.1 ? "right here" : `${miles.toFixed(1)} mi away`;
}

function subwayDetail(listing: BoardListing): string {
  if (listing.system !== "Subway") return "";
  const routes = listing.routes.join(" · ");
  return listing.alsoKnownAs.length > 0
    ? `${routes} — also ${listing.alsoKnownAs.join(", ")}`
    : routes;
}

export function BoardListingList({ items }: { items: BoardListingListItem[] }) {
  return (
    <ul className="divide-y divide-edge">
      {items.map((item) => {
        const { listing } = item;
        const details = [
          item.distanceKm === undefined ? "" : formatDistance(item.distanceKm),
          subwayDetail(listing),
        ].filter(Boolean).join(" · ");

        return (
          <li key={boardChoiceKey(listing.choice)}>
            <Link
              href={listing.href}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{listing.name}</span>
                {/* Dozens of Subway stations share a name, so the routes have to
                    be readable rather than only coloured — the bullets beside
                    them are decoration. The complex's other published names
                    follow, for a rider who searched one of those instead. */}
                {details && (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {details}
                  </span>
                )}
              </span>

              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {listing.system}
              </span>

              {/* Provider-native symbols: MTA route bullets carry their letter,
                  NJT line colours are a hint alongside the names above. */}
              <span aria-hidden className="flex shrink-0 gap-1">
                {listing.system === "Subway"
                  ? listing.routes.slice(0, 4).map((route) => (
                      <span
                        key={route}
                        className="grid h-4 w-4 place-items-center rounded-full text-[0.6rem] font-bold text-white"
                        style={{ backgroundColor: subwayRouteColor(route) }}
                      >
                        {route}
                      </span>
                    ))
                  : listing.routes.map((line) => (
                      <span
                        key={line}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: lineColor(line) }}
                      />
                    ))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
