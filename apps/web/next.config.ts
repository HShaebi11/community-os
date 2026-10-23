import type { NextConfig } from "next";

const api = process.env.API_PROXY_TARGET ?? "http://localhost:5173";

const nextConfig: NextConfig = {
  agentRules: false,
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
    ];
  },
};

export default nextConfig;
