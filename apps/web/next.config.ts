import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cafe-pos/contracts"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_URL ?? "http://127.0.0.1:4000"}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
