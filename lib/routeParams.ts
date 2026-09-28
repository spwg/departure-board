/**
 * A dynamic route segment, decoded once more if it still carries percent
 * escapes. Next normally hands params over decoded already, so a literal `%`
 * left in one is not an escape; rather than throw on it (a 500), keep the
 * value as given and let the caller's own validation turn it away.
 */
export function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
