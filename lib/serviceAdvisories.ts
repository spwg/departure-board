/**
 * A normalized official service notice: an NJ TRANSIT Rail Advisories RSS
 * item, or an MTA Subway alert.
 */
export type ServiceAdvisory = {
  /** The feed's GUID: the identity of this particular official notice. */
  id: string;
  /** Changes whenever the official notice's relevant contents change. */
  revision: string;
  text: string;
  /** The official notice online; NJ TRANSIT publishes one, MTA alerts do not. */
  url?: string;
  /** Longer official detail, when the source provides it apart from `text`. */
  details?: string;
  severity: "disruption" | "advisory";
  publishedAt: string | null;
};

/** Stable, compact fingerprint for an exact official notice. */
export function advisoryRevision(
  id: string,
  text: string,
  url: string | undefined,
  severity: ServiceAdvisory["severity"],
  publishedAt: string | null,
): string {
  const input = `${id}\u0000${text}\u0000${url ?? ""}\u0000${severity}\u0000${publishedAt ?? ""}`;
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
