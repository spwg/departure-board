/** A normalized official NJ TRANSIT Rail Advisories RSS notice. */
export type ServiceAdvisory = {
  /** The feed's GUID: the identity of this particular official notice. */
  id: string;
  /** Changes whenever the official notice's relevant contents change. */
  revision: string;
  text: string;
  /** Always an njtransit.com URL from the RSS item. */
  url: string;
  severity: "disruption" | "advisory";
  publishedAt: string | null;
};

/** Stable, compact fingerprint for an exact official notice. */
export function advisoryRevision(
  id: string,
  text: string,
  url: string,
  severity: ServiceAdvisory["severity"],
  publishedAt: string | null,
): string {
  const input = `${id}\u0000${text}\u0000${url}\u0000${severity}\u0000${publishedAt ?? ""}`;
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
