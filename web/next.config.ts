import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@drekis/shader"],
  typedRoutes: true,
};

export default nextConfig;
