import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // A second local dev server can use its own build folder: NEXT_DIST_DIR=.next-dev next dev
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@bugsnap/shared"],
}

export default nextConfig
