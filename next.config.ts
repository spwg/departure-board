import type { NextConfig } from "next";
import { njtEnvironment, usingFixtures } from "./lib/njtEnvironment";

// With NJ Transit credentials set, NJT_ENV must name their backend. Checking
// here fails the build or server start, not a rider's request: a deployment
// missing it never goes live.
if (!usingFixtures()) njtEnvironment();

/**
 * Only the policy directives that restrict nothing the app itself loads: no
 * framing by other sites, no plugins, no <base> rewriting. Script sources stay
 * unrestricted; blocking inline scripts would need a per-request nonce, which
 * rules out the prerendered pages Cache Components gives us.
 */
const contentSecurityPolicy = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Keeps Cache Components and partial prerendering enabled for the App Router.
  cacheComponents: true,
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
        ],
      },
    ];
  },
};

export default nextConfig;
