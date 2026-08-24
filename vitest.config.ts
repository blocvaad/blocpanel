import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Expected-failure tests (it.fails) document known audit gaps; they
    // pass by failing. dangerouslyIgnoreUnhandledErrors stays off.
  },
});
