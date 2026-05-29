import { Cron } from "croner";
import type { Agent, Logger } from "@thiny/core";

/** Trigger for a scheduled job. */
export type Trigger = { kind: "interval"; ms: number } | { kind: "cron"; expr: string };

/** A scheduled job configuration. */
export interface Job {
  /** Unique name used as the job's session ID prefix. */
  name: string;
  /** When to fire the job. */
  trigger: Trigger;
  /**
   * Input to pass to `agent.run`. May be a static string or an async factory
   * that produces a string at run time (e.g. fetching a feed or market price).
   */
  input: string | (() => string | Promise<string>);
  /** Override the default `job:<name>` session ID. */
  sessionId?: string;
  /**
   * Hard stop after this many successful runs.
   * Use during development to prevent runaway autonomous runs.
   */
  maxRuns?: number;
}

/** Options for creating a `Runtime` instance. */
export interface RuntimeOptions {
  /** The agent to run jobs against. */
  agent: Agent;
  /** Jobs to register on `start()`. Can also be added dynamically via `runJob`. */
  jobs?: Job[];
  /** Optional logger for job lifecycle events. */
  logger?: Logger;
}

/**
 * Autonomous job scheduler for Thiny agents.
 *
 * Runs jobs on an interval or cron schedule, protecting against:
 * - **Overlap:** a job that is still running when its next tick fires is skipped.
 * - **maxRuns:** a job stops firing after a configurable number of completions.
 *
 * @example heartbeat every 60 seconds
 * ```ts
 * const runtime = new Runtime({
 *   agent,
 *   jobs: [{
 *     name: "heartbeat",
 *     trigger: { kind: "interval", ms: 60_000 },
 *     input: "Heartbeat: evaluate and act if needed.",
 *     maxRuns: 100,
 *   }],
 * });
 * runtime.start();
 * process.on("SIGINT", async () => { await runtime.stop(); process.exit(0); });
 * ```
 */
export class Runtime {
  private readonly timers: Array<{ stop: () => void }> = [];
  private readonly inFlight = new Set<string>();
  private readonly runCounts = new Map<string, number>();
  private stopped = false;

  constructor(private readonly opts: RuntimeOptions) {}

  /**
   * Fire a single job invocation.
   *
   * Silently skips when:
   * - A previous run of the same job is still in flight.
   * - The job's `maxRuns` limit has been reached.
   * - The runtime has been stopped.
   */
  async runJob(job: Job): Promise<void> {
    if (this.stopped) return;
    if (this.inFlight.has(job.name)) return;

    const count = this.runCounts.get(job.name) ?? 0;
    if (job.maxRuns !== undefined && count >= job.maxRuns) return;

    this.inFlight.add(job.name);
    this.runCounts.set(job.name, count + 1);

    try {
      const input = typeof job.input === "function" ? await job.input() : job.input;
      const sessionId = job.sessionId ?? `job:${job.name}`;
      const reply = await this.opts.agent.run(input, { sessionId });
      this.opts.logger?.info(
        { event: "job_completed", job: job.name, run: count + 1, replyLength: reply.length },
        `Job "${job.name}" run ${String(count + 1)} completed`,
      );
    } catch (err) {
      this.opts.logger?.error(
        { event: "job_failed", job: job.name, run: count + 1, error: String(err) },
        `Job "${job.name}" run ${String(count + 1)} failed: ${String(err)}`,
      );
    } finally {
      this.inFlight.delete(job.name);
    }
  }

  /** Wire up all triggers and begin scheduling. */
  start(): void {
    this.stopped = false;

    for (const job of this.opts.jobs ?? []) {
      if (job.trigger.kind === "interval") {
        const id = setInterval(() => void this.runJob(job), job.trigger.ms);
        this.timers.push({
          stop: () => {
            clearInterval(id);
          },
        });
      } else {
        const cronJob = new Cron(job.trigger.expr, () => void this.runJob(job));
        this.timers.push({
          stop: () => {
            cronJob.stop();
          },
        });
      }
    }

    this.opts.logger?.info(
      { event: "runtime_started", jobs: (this.opts.jobs ?? []).map((j) => j.name) },
      `Runtime started with ${String(this.opts.jobs?.length ?? 0)} job(s)`,
    );
  }

  /**
   * Stop all scheduled triggers.
   * In-flight runs complete naturally; new runs are blocked.
   */
  stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers) timer.stop();
    this.timers.length = 0;
    this.opts.logger?.info({ event: "runtime_stopped" }, "Runtime stopped");
    return Promise.resolve();
  }
}
