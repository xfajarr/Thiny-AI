import { describe, it, expect, vi } from "vitest";
import { Runtime, type Job } from "../index.js";
import type { Agent } from "@thiny/core";

function fakeAgent(run: Agent["run"]): Agent {
  return {
    run: run,
    registry: {} as unknown as Agent["registry"],
    events: {} as unknown as Agent["events"],
  };
}

describe("Runtime", () => {
  it("calls agent.run with the job input and a derived sessionId", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run) });
    await rt.runJob({ name: "j", trigger: { kind: "interval", ms: 1000 }, input: "tick" });
    expect(run).toHaveBeenCalledWith("tick", { sessionId: "job:j" });
  });

  it("resolves a function input before running", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run) });
    await rt.runJob({
      name: "j",
      trigger: { kind: "interval", ms: 1000 },
      input: async () => "computed",
    });
    expect(run).toHaveBeenCalledWith("computed", { sessionId: "job:j" });
  });

  it("skips a job when a previous run is still in flight (no-overlap)", async () => {
    let release!: () => void;
    const run = vi.fn(
      () =>
        new Promise<string>((r) => {
          release = () => {
            r("ok");
          };
        }),
    );
    const rt = new Runtime({ agent: fakeAgent(run) });
    const job: Job = { name: "j", trigger: { kind: "interval", ms: 1000 }, input: "tick" };
    const p1 = rt.runJob(job);
    const p2 = rt.runJob(job); // skipped — first run still in flight
    release();
    await Promise.all([p1, p2]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stops firing after maxRuns is reached", async () => {
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({ agent: fakeAgent(run) });
    const job: Job = {
      name: "j",
      trigger: { kind: "interval", ms: 1000 },
      input: "tick",
      maxRuns: 2,
    };
    await rt.runJob(job); // run 1
    await rt.runJob(job); // run 2
    await rt.runJob(job); // skipped — maxRuns reached
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("fires interval jobs and stops cleanly", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => "ok");
    const rt = new Runtime({
      agent: fakeAgent(run),
      jobs: [{ name: "hb", trigger: { kind: "interval", ms: 1000 }, input: "tick" }],
    });
    rt.start();
    await vi.advanceTimersByTimeAsync(2500);
    await rt.stop();
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
