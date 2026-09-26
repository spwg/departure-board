import { lineColor, lineName } from "@/lib/stations";

/** NJT's line colours with their names, as the rail map labels them. */
export function NjtLines({ lines }: { lines: string[] }) {
  return (
    // Inline items so a long list ends in an ellipsis rather than a cut word.
    <ul className="min-w-0 truncate text-xs leading-5 text-muted">
      {lines.map((line) => (
        <li key={line} className="mr-2 inline">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: lineColor(line) }} />
          {lineName(line)}
        </li>
      ))}
    </ul>
  );
}
