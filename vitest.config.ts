import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.tsx"],
    // Every test module except the token store, which runs under `node:test`
    // via `npm run test:node`. A glob rather than a list so a new test file is
    // never silently left unrun.
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "tests/njtTokenStore.test.ts"],
    clearMocks: true,
  },
});
