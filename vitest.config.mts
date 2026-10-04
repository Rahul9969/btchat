import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Protocol logic only. Node 24 provides BroadcastChannel, crypto.subtle, and Blob as globals.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
