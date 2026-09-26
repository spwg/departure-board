import Link from "next/link";

/** The train page's way to its New York Penn track history. */
export function PositionHistoryButton({ train, from }: { train: string; from: string }) {
  const query = from ? `?from=${encodeURIComponent(from)}` : "";
  return (
    <Link
      href={`/train/${encodeURIComponent(train)}/positions${query}`}
      aria-label="Penn track history"
      title="Penn track history"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      {/* A clock with a return arrow: history. */}
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l3 2" />
      </svg>
    </Link>
  );
}
