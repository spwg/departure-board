import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.tsx"],
    include: ["tests/{components,departures,njt-client,njt-directions,recent-stations,route,service-advisories,service-advisories-route,service-status,stations-fixtures,subway,subway-route,watch-monitor,watches}.test.{ts,tsx}"],
    clearMocks: true,
  },
});
