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
   * Enabled automatically when no `file` is set, no `stderr`, and NODE_ENV !== "production".
   * Pass `false` to force JSON output even in development.
   */
  pretty?: boolean;
  /**
   * Write structured JSON logs to stderr (fd 2) instead of stdout.
   * Use this in TUI/CLI contexts so log output never pollutes the UI.
   * Takes precedence over `pretty` — when set, output is always JSON on stderr.
   */
  stderr?: boolean;
}

/** Adapt a pino instance to Thiny's Logger port. */
function adaptPinoLogger(instance: PinoLogger): Logger {
  return {
    info: (obj, msg) => {
      instance.info(obj, msg);
    },
    warn: (obj, msg) => {
      instance.warn(obj, msg);
    },
    error: (obj, msg) => {
      instance.error(obj, msg);
    },
    child: (bindings) => adaptPinoLogger(instance.child(bindings)),
  };
}

/**
 * Create a structured pino logger that satisfies Thiny's Logger port.
 *
 * @example basic usage
 * ```ts
 * import { pinoLogger } from "@thiny/logger-pino";
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   logger: pinoLogger(),
 * });
 * ```
 *
 * @example audit trail to a file
 * ```ts
 * pinoLogger({ file: "audit.log" })
 * ```
 *
 * @example force JSON output in development
 * ```ts
 * pinoLogger({ pretty: false })
 * ```
 */
export function pinoLogger(opts: PinoLoggerOptions = {}): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? "info";

  // stderr mode: structured JSON to fd 2 — never pollutes stdout/TUI
  if (opts.stderr) {
    return adaptPinoLogger(pino({ level }, pino.destination({ dest: 2, sync: false })));
  }

  // File sink: structured JSON, async (non-blocking)
  if (opts.file) {
    const destination = pino.destination({ dest: opts.file, sync: false });
    return adaptPinoLogger(pino({ level }, destination));
  }

  const usePretty =
    opts.pretty ?? (opts.file === undefined && process.env.NODE_ENV !== "production");

  if (usePretty) {
    return adaptPinoLogger(
      pino({
        level,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
    );
  }

  return adaptPinoLogger(pino({ level }));
}
