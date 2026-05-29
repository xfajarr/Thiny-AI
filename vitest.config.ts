import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts", "heads/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      // Include only source files — exclude tests, barrels, and type-only files
      include: [
        "packages/core/src/**/*.ts",
        "packages/adapters/*/src/**/*.ts",
        "packages/plugins/*/src/**/*.ts",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "**/index.ts", // barrel re-export files
        "**/domain/**/*.ts", // type-only domain files
        "**/dist/**",
      ],
      // Thresholds — increase these as the test suite grows
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 40,
        lines: 55,
      },
    },
  },
});
