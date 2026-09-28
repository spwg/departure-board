/**
 * A dynamic route segment, decoded. Next is inconsistent here: API routes and
 * generateMetadata receive params already decoded, but a page component
 * rendered under partial prerendering receives the raw percent-encoded
 * segment (a subway trip id arrives as `mta%3Aace%3A…`). Decoding covers the
 * page case; a value that is already decoded and holds a literal `%` would
 * throw, so it is kept as given for the caller's own validation to turn away.
 */
export function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
