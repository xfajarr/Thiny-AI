import pino, { type Logger as PinoLogger } from "pino";
import type { Logger } from "@thiny/core";

export interface PinoLoggerOptions {
  /** Minimum log level. Default: "info". */
  level?: string;
  /**
   * Write structured JSON to a file path instead of stdout.
   * Useful for immutable audit trails — set to e.g. "audit.log".
   */
  file?: string;
  /**
   * Pretty-print logs to the terminal.
   * Enabled automatically when no `file` is set and NODE_ENV !== "production".
   * Pass `false` to force JSON output even in development.
   */
  pretty?: boolean;
}

function wrap(p: PinoLogger): Logger {
  return {
    info: (obj, msg) => {
      p.info(obj, msg);
    },
    warn: (obj, msg) => {
      p.warn(obj, msg);
    },
    error: (obj, msg) => {
      p.error(obj, msg);
    },
    child: (bindings) => wrap(p.child(bindings)),
  };
}

/**
 * Create a structured pino logger that satisfies Thiny's Logger port.
 *
 * @example
 * ```ts
 * import { pinoLogger } from "@thiny/logger-pino";
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   logger: pinoLogger({ level: "info" }),
 * });
 * ```
 *
 * @example audit trail to a file
 * ```ts
 * pinoLogger({ level: "info", file: "audit.log" })
 * ```
 *
 * @example pretty terminal output (dev default)
 * ```ts
 * pinoLogger({ level: "debug", pretty: true })
 * ```
 */
export function pinoLogger(opts: PinoLoggerOptions = {}): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? "info";
  const usePretty =
    opts.pretty ?? (opts.file === undefined && process.env.NODE_ENV !== "production");

  if (opts.file) {
    // File sink: structured JSON, async (non-blocking)
    const dest = pino.destination({ dest: opts.file, sync: false });
    return wrap(pino({ level }, dest));
  }

  if (usePretty) {
    // Terminal: human-readable coloured output
    return wrap(
      pino({
        level,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
    );
  }

  // Production: plain JSON to stdout
  return wrap(pino({ level }));
}
