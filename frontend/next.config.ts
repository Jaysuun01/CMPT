import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  // E2E builds into its own folder (playwright.config.ts), so a test run never overwrites what `npm run dev` serves.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // The browser only talks to this origin; /api/* is forwarded to the backend.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
