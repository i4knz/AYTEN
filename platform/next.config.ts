import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...((process.env.APP_URL ?? "").startsWith("https://")
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  experimental: {
    // Product images are uploaded through Server Actions (max 8 MB per image, one request per image batch).
    serverActions: { bodySizeLimit: "25mb" },
    // The proxy buffers request bodies; keep its limit in line so uploads are not truncated.
    proxyClientMaxBodySize: "25mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
