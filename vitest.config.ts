import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.tsx"],
    include: ["tests/{components,departures,njt-client,recent-stations,route,stations-fixtures}.test.{ts,tsx}"],
    clearMocks: true,
  },
});
