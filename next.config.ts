import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

let wsToken = "";
try {
  wsToken = fs.readFileSync(path.join(process.cwd(), "ws_token.txt"), "utf-8").trim();
} catch (e) {
  console.warn("ws_token.txt not found. Daemon may not be running.");
}

const nextConfig: NextConfig = {
  // Capacitor loads the files from `out/`. There is no server at run time.
  output: "export",
  // Emit `/join/index.html` instead of `/join.html` so the Capacitor web view can resolve routes as folders.
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_WS_TOKEN: wsToken,
  },
};

export default nextConfig;
