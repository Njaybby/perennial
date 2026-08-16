import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @perennial/core ships TypeScript source rather than a build artifact, so Next has to compile it alongside the app.
  transpilePackages: ["@perennial/core"],
  webpack(config) {
    // That source uses ESM-style ".js" specifiers that point at ".ts" files on disk, which Node resolves natively and webpack does not.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
