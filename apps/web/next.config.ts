import type { NextConfig } from "next";

// When API_PROXY_TARGET is set (for example https://cit-lms-api.vercel.app), browser calls to /api/* are
// forwarded to the API by the web server. The browser then only talks to the web origin, so the session
// cookie is first-party and the API's cross-site request guard works without third-party cookies.
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return apiProxyTarget ? [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }] : [];
  }
};

export default nextConfig;
