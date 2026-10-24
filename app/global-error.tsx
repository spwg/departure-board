"use client";

import { useEffect } from "react";

/**
 * The last resort, when the root layout itself fails. It replaces the whole
 * document, so the app's stylesheet and theme are absent: plain inline styles
 * that follow the OS colour scheme.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", colorScheme: "light dark", textAlign: "center", padding: "4rem 1.25rem" }}>
        <title>Departures</title>
        <p style={{ fontWeight: 600, margin: 0 }}>Departures didn&apos;t load.</p>
        <p style={{ opacity: 0.7, fontSize: "0.875rem", margin: "0.25rem 0 1.25rem" }}>
          Something went wrong on our side. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{ font: "inherit", fontSize: "0.875rem", padding: "0.5rem 1rem", borderRadius: "9999px", border: "1px solid currentColor", background: "transparent", color: "inherit" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
