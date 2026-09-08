import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The engine runs in a module worker; the protocol's messages are
  // structured-cloneable, so no bundler shim is involved.
  worker: { format: "es" },
});
