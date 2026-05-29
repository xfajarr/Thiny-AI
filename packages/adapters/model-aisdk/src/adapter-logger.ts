import pino from "pino";
import type { Logger } from "@thiny/core";

/**
 * A module-level structured logger for `@thiny/model-aisdk` internals.
 *
 * Used by `loadThinyConfig` and the message converter to emit warnings
 * without requiring a user-supplied logger. Level is controlled by the
 * `LOG_LEVEL` environment variable (default: `"info"`).
 *
 * This logger is intentionally separate from the agent's session logger —
 * it covers one-time adapter-level events (config discovery, parse warnings)
 * that happen outside of a running session.
 */
const rawLogger = pino({
  name: "@thiny/model-aisdk",
  level: process.env.LOG_LEVEL ?? "info",
});

export const adapterLogger: Logger = {
  info: (obj, msg) => {
    rawLogger.info(obj, msg);
  },
  warn: (obj, msg) => {
    rawLogger.warn(obj, msg);
  },
  error: (obj, msg) => {
    rawLogger.error(obj, msg);
  },
  child: (bindings) => {
    const child = rawLogger.child(bindings);
    return {
      info: (obj, msg) => {
        child.info(obj, msg);
      },
      warn: (obj, msg) => {
        child.warn(obj, msg);
      },
      error: (obj, msg) => {
        child.error(obj, msg);
      },
      child: (b) => adapterLogger.child({ ...bindings, ...b }),
    };
  },
};
