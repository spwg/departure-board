/**
 * Runs once when a Next.js server starts. On the always-on server, where
 * PENN_COLLECTOR=true, it starts the New York Penn collector (lib/pennCollector);
 * everywhere else, including Vercel, it does nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.PENN_COLLECTOR !== "true") return;

  // Dev reloads can register again; keep a single timer per process.
  const flag = globalThis as { __pennCollectorStarted?: boolean };
  if (flag.__pennCollectorStarted) return;
  flag.__pennCollectorStarted = true;

  const { collectorOptionsFromEnv, startCollector } = await import("./lib/pennCollector");
  const options = collectorOptionsFromEnv(process.env);
  if ("error" in options) {
    console.error(`Penn collector not started: ${options.error}`);
    return;
  }
  console.log(`Penn collector started: every ${options.intervalMs / 1000}s`);
  startCollector(options);
}
