"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Shown when rendering a page throws: a bug, not a data outage. Boards and
 * stop lists report their own load failures in place (LoadFailureNotice), so
 * reaching this means the page itself could not be drawn. Try again re-renders
 * the page once, when the rider asks.
 */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div role="alert" className="flex flex-1 flex-col overflow-clip border-edge bg-surface px-5 py-16 text-center sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <p className="font-medium text-text">This page didn&apos;t load.</p>
        <p className="mt-1 text-sm text-muted">Something went wrong on our side. Try again, or start from Home.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-full border border-edge px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-edge px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
