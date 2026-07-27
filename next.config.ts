import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables `use cache`, which persists across serverless invocations. The API
  // token cache below depends on that persistence.
  cacheComponents: true,
  cacheLife: {
    // NJ Transit allows only 10 getToken calls per day and asks that it be
    // called about once daily, so refresh at most twice a day. A token that
    // goes bad early is invalidated on demand via revalidateTag rather than
    // being polled for.
    njtToken: {
      stale: 60 * 60 * 12,
      revalidate: 60 * 60 * 12,
      expire: 60 * 60 * 23,
    },
  },
};

export default nextConfig;
