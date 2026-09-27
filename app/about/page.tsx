import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { PageTitle } from "@/components/PageTitle";
import { HomeButton } from "@/components/StationHeader";

export const metadata: Metadata = {
  title: "About data",
};

/** Explains the source and limits of the departure information shown in the app. */
export default function AboutPage() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const environment = process.env.VERCEL_ENV ?? "local";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col sm:py-6">
      <div className="flex flex-1 flex-col overflow-clip border-edge bg-surface sm:flex-none sm:rounded-2xl sm:border sm:shadow-sm">
        <PageHeader>
          <HomeButton />
          <PageTitle title="About data" />
        </PageHeader>

        <div className="space-y-6 p-4 sm:p-5">
          <section aria-label="About data" className="rounded-xl border border-edge bg-surface-raised p-4">
            <div className="space-y-4 text-sm leading-6 text-muted">
              <p>
                Departure information is obtained from NJ TRANSIT and redistributed
                by this app.
              </p>
              <p>
                Information may be delayed, incomplete, or inaccurate and may not
                reflect real-time conditions. Verify critical travel details with NJ
                TRANSIT before you travel.
              </p>
              <p>
                This app is not affiliated with, endorsed by, or licensed by NJ
                TRANSIT.
              </p>
              <p>
                An <strong className="font-semibold text-text">Airport service</strong> label means the train serves Newark Airport. A
                <strong className="font-semibold text-text"> via Secaucus</strong> label appears only when it distinguishes trains
                headed to the same destination.
              </p>
              <a
                href="https://developer.njtransit.com/terms/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex font-medium text-text underline decoration-edge-strong underline-offset-4 transition-colors hover:decoration-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                NJ TRANSIT Developer Terms
              </a>
            </div>
          </section>

          <section
            aria-labelledby="app-version-title"
            className="rounded-xl border border-edge bg-surface-raised p-4"
          >
            <h2 id="app-version-title" className="text-base font-semibold">
              App version
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use these details to confirm which deployment is serving this page.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted">Environment</dt>
              <dd className="font-medium text-text">{environment}</dd>
              <dt className="text-muted">Commit</dt>
              <dd className="font-mono text-text">{commit ?? "Unavailable"}</dd>
              {branch && (
                <>
                  <dt className="text-muted">Branch</dt>
                  <dd className="font-mono text-text">{branch}</dd>
                </>
              )}
              {deploymentId && (
                <>
                  <dt className="text-muted">Deployment</dt>
                  <dd className="break-all font-mono text-text">{deploymentId}</dd>
                </>
              )}
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
