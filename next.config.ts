import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions are used for every write. Keep the payload small:
    // signature images go to Supabase Storage, never through an action.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
