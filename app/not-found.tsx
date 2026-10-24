import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PageTitle } from "@/components/PageTitle";
import { HomeButton } from "@/components/StationHeader";

export const metadata: Metadata = {
  title: "Not found",
};

/**
 * Every unknown address lands here: a station code or train number this app
 * does not know (pages call notFound() for those), or a mistyped path. Train
 * numbers are reassigned daily, so an old link to a train is the common case.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <PageHeader>
          <HomeButton />
          <PageTitle title="Not found" />
        </PageHeader>
        <div className="px-5 py-16 text-center">
          <p className="font-medium text-text">There&apos;s no station or train here.</p>
          <p className="mt-1 text-sm text-muted">
            The link may be mistyped, or point to a train that is no longer running.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full border border-edge px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Find a station
          </Link>
        </div>
      </div>
    </main>
  );
}
