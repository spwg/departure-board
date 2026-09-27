import { lineColor, lineName } from "@/lib/stations";

/**
 * NJT's line colours with their names, as the rail map labels them. A phone
 * has room for only a couple of names beside a station's controls, so a
 * busier station shows its colours alone there; the departure rows name each
 * train's line anyway.
 */
export function NjtLines({ lines }: { lines: string[] }) {
  const coloursOnly = lines.length > 2;
  return (
    // Inline items so a long list ends in an ellipsis rather than a cut word.
    <ul className="min-w-0 truncate text-xs leading-5 text-muted">
      {lines.map((line) => (
        <li key={line} title={lineName(line)} className="mr-2 inline">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: lineColor(line) }} />
          {coloursOnly ? (
            <>
              <span className="sr-only sm:hidden">{lineName(line)}</span>
              <span className="hidden sm:inline">{lineName(line)}</span>
            </>
          ) : (
            lineName(line)
          )}
        </li>
      ))}
    </ul>
  );
}
