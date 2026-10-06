import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF renderers read DejaVu fonts from disk at runtime; the tracer
  // can't see that, so list them for every route that renders or re-sends.
  outputFileTracingIncludes: {
    "/dostava": ["./src/lib/documents/fonts/**"],
    "/pisarna": ["./src/lib/documents/fonts/**"],
  },
  experimental: {
    // Server Actions are used for every write. Keep the payload small:
    // signature images go to Supabase Storage, never through an action.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
