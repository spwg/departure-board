import type { Metadata } from "next";
import Link from "next/link";

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
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        All stations
      </Link>

      <article className="mt-6 rounded-xl border border-edge bg-surface p-5 sm:p-7">
        <h1 className="text-2xl font-bold tracking-tight">About data</h1>
        <div className="mt-5 space-y-4 text-sm leading-6 text-muted">
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
      </article>

      <section
        aria-labelledby="app-version-title"
        className="mt-4 rounded-xl border border-edge bg-surface p-5 sm:p-7"
      >
        <h2 id="app-version-title" className="text-lg font-semibold tracking-tight">
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
    </main>
  );
}
