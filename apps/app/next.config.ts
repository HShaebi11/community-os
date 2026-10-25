import type { NextConfig } from "next";

const api = process.env.API_PROXY_TARGET ?? "http://localhost:5173";

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [{ source: "/desk/:path+", destination: "/desk", permanent: false }];
  },
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
      { source: "/mcp", destination: `${api}/mcp` },
      { source: "/mcp/:path*", destination: `${api}/mcp/:path*` },
    ];
  },
};

export default nextConfig;
