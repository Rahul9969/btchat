import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capacitor loads the files from `out/`. There is no server at run time.
  output: "export",
  // Emit `/join/index.html` instead of `/join.html` so the Capacitor web view can resolve routes as folders.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
