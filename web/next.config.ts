import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@drekis/shader"],
  typedRoutes: true,
  // Workspace root is one level up so the file: dependency on ../shader resolves
  turbopack: { root: path.join(__dirname, "..", "..") },
};

export default nextConfig;
