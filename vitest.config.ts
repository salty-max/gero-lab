import { defineConfig } from "vitest/config";

// Kept apart from `vite.config.ts`: the two packages pin different Vite
// versions, and merging them makes the plugin types disagree for no
// gain — the tests need no plugins.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
