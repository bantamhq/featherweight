import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
    },
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
