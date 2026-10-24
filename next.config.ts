import type { NextConfig } from "next";
import { njtEnvironment, usingFixtures } from "./lib/njtEnvironment";

// With NJ Transit credentials set, NJT_ENV must name their backend. Checking
// here fails the build or server start, not a rider's request: a deployment
// missing it never goes live.
if (!usingFixtures()) njtEnvironment();

/**
 * Everything the app loads is its own: scripts, styles, self-hosted fonts and
 * Vercel's analytics all come from this origin, and the browser only ever
 * calls this site's /api routes. Inline scripts stay allowed — blocking them
 * would need a per-request nonce, which rules out the prerendered pages Cache
 * Components gives us — but a script from any other origin is refused.
 * Development also needs eval for React's error overlays.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Location is the only device feature the app uses, for nearby stations. */
const permissionsPolicy = [
  "geolocation=(self)",
  "camera=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

const nextConfig: NextConfig = {
  // Keeps Cache Components and partial prerendering enabled for the App Router.
  cacheComponents: true,
  // No need to advertise the framework to scanners.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // For browsers that predate frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: permissionsPolicy },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Two years, this host only: without knowing every subdomain of a
          // custom domain, includeSubDomains could break one served over HTTP.
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
};

export default nextConfig;
