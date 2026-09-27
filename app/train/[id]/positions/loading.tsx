import { PageTitle } from "@/components/PageTitle";
import { HomeButton } from "@/components/StationHeader";
import { SettingsButton } from "@/components/SettingsButton";

/** The Suspense boundary for the request-time train and history read. */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <header className="flex items-center gap-1 border-b border-edge px-2 py-2.5 sm:px-3">
          <HomeButton />
          <PageTitle title="Penn track history" />
          <SettingsButton />
        </header>
        <p className="px-5 py-16 text-center text-muted">Loading track history…</p>
      </div>
    </main>
  );
}
