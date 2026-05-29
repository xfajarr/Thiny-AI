// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  // ── Ignored paths ───────────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.config.js", // this file (eslint.config.js)
      "**/*.config.ts", // vitest.config.ts etc — config files, not app code
      "**/*.config.example.json",
      "coverage/**",
    ],
  },

  // ── Base JS rules ───────────────────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript strict rules ─────────────────────────────────────────────────
  // strictTypeChecked = all type-aware rules at "error" level.
  // stylisticTypeChecked = enforces consistent code style.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ── Project-wide settings ───────────────────────────────────────────────────
  {
    languageOptions: {
      parserOptions: {
        // projectService: true auto-discovers per-package tsconfig.json files —
        // no need to list them manually for a monorepo.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      // ── Critical async rules (most important for agent code) ─────────────
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",

      // ── Type import discipline ────────────────────────────────────────────
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",

      // ── Explicit typing at module boundaries ────────────────────────────
      "@typescript-eslint/explicit-module-boundary-types": "off", // too noisy for internal utils
      "@typescript-eslint/explicit-function-return-type": "off", // inferred is fine

      // ── Unused variables — allow _ prefix for intentionally unused ───────
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ── Pragmatic relaxations for a tool-calling framework ───────────────
      // Tool args come from an LLM as `unknown`; type assertions are the right
      // pattern here — the Zod boundary is the real safety net.
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",

      // Non-null assertions: warn rather than error (used deliberately).
      "@typescript-eslint/no-non-null-assertion": "warn",

      // Allow `as const` / type narrowing casts (common in domain code).
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow-as-parameter" },
      ],

      // ── Style ────────────────────────────────────────────────────────────
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
    },
  },

  // ── Prettier — must be last, disables ESLint rules that conflict ───────────
  prettierConfig,

  // ── Test file relaxations ──────────────────────────────────────────────────
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    rules: {
      // Tests intentionally use `{} as never` to build fake contexts.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/require-await": "off",
      // Spies and fake functions commonly return void without await.
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
);
