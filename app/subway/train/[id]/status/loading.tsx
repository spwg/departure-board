import { PageHeader } from "@/components/PageHeader";
import { PageTitle } from "@/components/PageTitle";
import { HomeButton } from "@/components/StationHeader";
import { SettingsButton } from "@/components/SettingsButton";

/** The Suspense boundary for the request-time trip and route. */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-hidden border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <PageHeader sticky={false}>
          <HomeButton />
          <PageTitle title="Service status" />
          <SettingsButton />
        </PageHeader>
        <p className="px-5 py-16 text-center text-muted">Loading service status…</p>
      </div>
    </main>
  );
}
