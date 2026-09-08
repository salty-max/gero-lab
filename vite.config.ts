import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The engine runs in a module worker; the protocol's messages are
  // structured-cloneable, so no bundler shim is involved.
  worker: { format: "es" },
});
