import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs"],
  images: { remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }] },
};

export default nextConfig;
