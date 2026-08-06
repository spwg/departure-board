import type { TransitSystem } from "./boardChoices";

/**
 * One system's view of an Interchange.
 *
 * `stationIds` is a list because a system may reach an Interchange through
 * more than one of its own stations: MTA publishes 34 St-Penn Station twice,
 * as two separate complexes, one for the 1/2/3 and one for the A/C/E.
 */
export type InterchangeView = {
  system: TransitSystem;
  /** The textual System chip, and the `system` URL value that selects it. */
  label: "NJT" | "Subway";
  stationIds: string[];
};

/**
 * A rider-recognized connection among stations that remain their providers'
 * own. It controls navigation and presentation only — it owns no live data,
 * and merges none: each view loads, fails and ages on its own.
 */
export type Interchange = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Views in switch order; the first is the default when none is selected. */
  views: InterchangeView[];
};

export const INTERCHANGES: Interchange[] = [
  {
    id: "penn",
    name: "New York Penn Station",
    latitude: 40.750569,
    longitude: -73.993519,
    views: [
      { system: "njt", label: "NJT", stationIds: ["NY"] },
      // The two MTA Penn stations stay separate identities upstream; the view
      // presents them together because MTA publishes the same Uptown and
      // Downtown labels for both.
      { system: "subway", label: "Subway", stationIds: ["128", "A28"] },
    ],
  },
];

export function getInterchange(id: string): Interchange | undefined {
  return INTERCHANGES.find((interchange) => interchange.id === id);
}

/** The view a `system` URL value selects, falling back to the first view. */
export function interchangeView(
  interchange: Interchange,
  system: string | undefined,
): InterchangeView {
  return (
    interchange.views.find((view) => view.system === system) ?? interchange.views[0]!
  );
}

/** The Interchange a provider station belongs to, if any. */
export function interchangeForStation(
  system: TransitSystem,
  stationId: string,
): { interchange: Interchange; view: InterchangeView } | null {
  for (const interchange of INTERCHANGES) {
    for (const view of interchange.views) {
      if (view.system === system && view.stationIds.includes(stationId)) {
        return { interchange, view };
      }
    }
  }
  return null;
}

/** The URL of one Interchange view. */
export function interchangeHref(interchange: Interchange, view: InterchangeView): string {
  return `/interchange/${interchange.id}/${view.system}`;
}
