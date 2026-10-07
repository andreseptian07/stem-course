import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/certificates": ["./assets/fonts/NotoSans-Regular.ttf"], "/api/certificates/*": ["./assets/fonts/NotoSans-Regular.ttf"] },
  poweredByHeader: false,
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
