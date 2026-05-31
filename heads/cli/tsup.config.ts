import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: [/^@thiny\//, "@xenova/transformers"],
  banner: {
    js: "#!/usr/bin/env node",
  },
  esbuildOptions(options) {
    options.platform = "node";
  },
});
