/**
 * Formats a time in the supplied zone using the viewer's preferred clock
 * convention. Supplying an hour cycle makes the device preference explicit;
 * passing a locale is useful for deterministic tests.
 */
export function formatTime(
  iso: string,
  timeZone: string,
  {
    locales,
    hourCycle,
  }: {
    locales?: Intl.LocalesArgument;
    hourCycle?: Intl.DateTimeFormatOptions["hourCycle"];
  } = {},
): string {
  return new Date(iso).toLocaleTimeString(locales, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hourCycle,
  });
}
