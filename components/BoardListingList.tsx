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

function aliases(listing: BoardListing): string {
  return listing.alsoKnownAs.length > 0 ? `also ${listing.alsoKnownAs.join(", ")}` : "";
}

export function BoardListingList({ items }: { items: BoardListingListItem[] }) {
  return (
    <ul className="divide-y divide-edge">
      {items.map((item) => {
        const { listing } = item;
        const details = [
          item.distanceKm === undefined ? "" : formatDistance(item.distanceKm),
          aliases(listing),
        ].filter(Boolean).join(" · ");

        return (
          <li key={boardChoiceKey(listing.choice)}>
            <Link
              href={listing.href}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words">{listing.name}</span>
                {/* Distance from the rider, then the complex's other published
                    names, for a rider who searched one of those instead. The
                    routes live only in the bullets on the right. */}
                {details && (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {details}
                  </span>
                )}
              </span>

              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                {listing.system}
              </span>

              {/* Provider-native symbols. Dozens of Subway stations share a
                  name, so the MTA bullets carry their letters — that is what
                  tells two "86 St" rows apart. NJT line colours
                  are a hint; the station's own board names the lines. */}
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
              {listing.system === "Subway" && (
                <span className="sr-only">{listing.routes.join(", ")} trains</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
