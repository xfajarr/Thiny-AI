import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts", "heads/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        // Core kernel
        "packages/core/src/**/*.ts",

        // Adapters
        "packages/adapters/*/src/**/*.ts",

        // Plugins — all of them
        "packages/plugins/*/src/**/*.ts",

        // Eval harness
        "packages/eval/src/**/*.ts",

        // Runtime scheduler
        "packages/runtime/src/**/*.ts",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "**/index.ts", // barrel re-export files have no logic to cover
        "**/domain/**/*.ts", // type-only files (interfaces, enums)
        "**/adapter-logger.ts", // tiny wrapper, covered transitively
        "**/dist/**",
      ],
      // Thresholds reflect actual measured coverage (2026-05-30).
      // Raise these as new tests are added — never lower them.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 75,
        lines: 80,
        // Per-directory: safety middleware must be >=90% branch covered
        "packages/core/src/middleware/**/*.ts": {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
    },
  },
});
