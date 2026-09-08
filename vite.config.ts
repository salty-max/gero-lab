import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // The engine runs in a module worker; the protocol's messages are
  // structured-cloneable, so no bundler shim is involved.
  worker: { format: "es" },
  test: {
    // The tests drive the worker layer against the real module — no
    // DOM, and no plugin the app build needs.
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
