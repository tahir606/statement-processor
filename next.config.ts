import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 builds a plain static site (used for the hosted version on GitHub Pages).
 * There's no server, so the rules-file route (the only .ts file under src/app) is left out
 * by limiting page extensions to .tsx, and each visitor's rules stay in their own browser.
 */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStatic
  ? {
      output: "export",
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
      pageExtensions: ["tsx"],
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
