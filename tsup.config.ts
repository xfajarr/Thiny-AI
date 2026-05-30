import { defineConfig } from "tsup";

/**
 * Shared tsup config for all Thiny packages.
 *
 * Produces:
 *   dist/index.js      — ESM (for Node ≥ 20 and modern bundlers)
 *   dist/index.d.ts    — TypeScript declarations
 *
 * Usage in each package's package.json:
 *   "build": "tsup src/index.ts --config ../../tsup.config.ts"
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // External: don't bundle workspace siblings — they're peerDependencies
  external: [/^@thiny\//],
  esbuildOptions(options) {
    // Ensure __dirname/__filename are not used (ESM)
    options.platform = "node";
  },
});
