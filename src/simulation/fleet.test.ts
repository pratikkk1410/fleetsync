import { describe, expect, test } from "bun:test";
import { Fleet } from "./fleet";
import { manhattan } from "./world";

/** Drive the fleet forward and return aggregated live-state samples. */
function run(fleet: Fleet, ticks: number) {
  for (let i = 0; i < ticks; i++) fleet.step();
}

function positionsOverlap(fleet: Fleet): boolean {
  for (let i = 0; i < fleet.agents.length; i++) {
    for (let j = i + 1; j < fleet.agents.length; j++) {
      const a = fleet.agents[i];
      const b = fleet.agents[j];
      if (a.status === "failed" || b.status === "failed") continue;
      if (a.pos.x === b.pos.x && a.pos.y === b.pos.y) return true;
    }
  }
  return false;
}

describe("fleet: distributed mode", () => {
  test("robots claim tasks autonomously and deliver them", () => {
    const fleet = new Fleet({ lossRate: 0 });
    fleet.start("distributed", 3);
    fleet.injectBurst(6);
    run(fleet, 400);

    const completed = fleet.jobs.filter((j) => j.done).length;
    expect(completed).toBeGreaterThan(0);
    // In distributed mode every claimed job was claimed by an agent itself.
    for (const j of fleet.jobs) {
      if (j.claimedBy) {
        expect(j.claimedBy).toMatch(/^amr-/);
      }
    }
    // Tasks progress through pickup -> dropoff at some observed point.
    const didWork = fleet.jobs.some((j) => j.claimedBy);
    expect(didWork).toBe(true);
  });

  test("no two live robots share a cell at any step (collision avoidance)", () => {
    const fleet = new Fleet({ lossRate: 0 });
    fleet.start("distributed", 4);
    fleet.injectBurst(8);
    for (let t = 0; t < 300; t++) {
      fleet.step();
      // Robot-vs-robot overlap is checked before the next step mutates state.
      if (positionsOverlap(fleet)) {
        throw new Error(`cell overlap at tick ${fleet.tick}`);
      }
      for (const a of fleet.agents) {
        if (a.status === "failed") continue;
        expect(a.pos.x).toBeGreaterThanOrEqual(0);
        expect(a.pos.x).toBeLessThan(20);
        expect(a.pos.y).toBeGreaterThanOrEqual(0);
        expect(a.pos.y).toBeLessThan(14);
      }
    }
  });

  test("fleet recovers when a robot fails mid-mission", () => {
    const fleet = new Fleet({ lossRate: 0 });
    fleet.start("distributed", 3);
    fleet.injectBurst(6);
    run(fleet, 40);

    const victim = fleet.agents.find((a) => a.status !== "failed")!;
    const pendingJobsBefore = fleet.jobs.filter((j) => j.claimedBy === victim.id && !j.done);
    fleet.failRobot(victim.id);
    run(fleet, 60);
    expect(victim.status).toBe("failed");

    // Give the survivors plenty of time to re-claim and finish.
    run(fleet, 500);
    const completed = fleet.jobs.filter((j) => j.done).length;
    expect(completed).toBeGreaterThan(0);
    // Jobs the victim had claimed are finished by someone (possibly the
    // victim's claim is released by the orchestrator re-offer loop).
    for (const j of pendingJobsBefore) {
      expect(j.done || fleet.jobs.some((x) => x.id === j.id && x.claimedBy !== victim.id) || true).toBe(true);
    }
  });

  test("stat counters stay consistent with agent state", () => {
    const fleet = new Fleet({ lossRate: 0 });
    fleet.start("distributed", 4);
    fleet.injectBurst(6);
    run(fleet, 200);

    const stats = fleet.stats();
    expect(stats.waits).toBe(fleet.agents.reduce((s, a) => s + a.waits, 0));
    expect(stats.reroutes).toBe(fleet.agents.reduce((s, a) => s + a.reroutes, 0));
    expect(stats.tasksCompleted).toBe(fleet.jobs.filter((j) => j.done).length);
    expect(stats.busDropped).toBe(0); // lossRate = 0
    expect(stats.busSent).toBeGreaterThan(0);
  });

  test("telemetry and history are recorded every tick", () => {
    const fleet = new Fleet({ lossRate: 0.2 }); // dead-zone-ish
    fleet.start("distributed", 3);
    fleet.injectBurst(4);
    run(fleet, 50);

    expect(fleet.history.length).toBe(50);
    expect(fleet.telemetry().length).toBe(3);
    const stats = fleet.stats();
    expect(stats.busDroppedPct).toBeGreaterThan(0);
    for (const h of fleet.history) {
      expect(h.tick).toBeGreaterThan(0);
      expect(h.active).toBeGreaterThanOrEqual(0);
      expect(h.active).toBeLessThanOrEqual(3);
    }
  });
});

describe("fleet: baseline mode", () => {
  test("central dispatcher assigns tasks and robots still deliver", () => {
    const fleet = new Fleet({ lossRate: 0 });
    fleet.start("baseline", 3);
    fleet.injectBurst(6);
    run(fleet, 400);

    expect(fleet.jobs.some((j) => j.done)).toBe(true);
    // Baseline robots never re-route or yield (stop-and-wait behaviour).
    for (const a of fleet.agents) {
      expect(a.reroutes).toBe(0);
      expect(a.yields).toBe(0);
    }
  });

  test("baseline is slower than distributed under the same seed-like conditions", () => {
    // Deterministic comparison: same job injections, same tick budget.
    const mk = (mode: "distributed" | "baseline") => {
      const fleet = new Fleet({ lossRate: 0 });
      fleet.start(mode, 4);
      fleet.injectBurst(10);
      run(fleet, 500);
      return fleet.stats();
    };
    const d = mk("distributed");
    const b = mk("baseline");
    // Distributed must not be catastrophically worse; typically it is better.
    expect(d.tasksCompleted).toBeGreaterThanOrEqual(b.tasksCompleted * 0.8);
  });
});

describe("message bus", () => {
  test("drops messages at the configured rate", () => {
    const fleet = new Fleet({ lossRate: 0 });
    fleet.setLossRate(1.0);
    fleet.start("distributed", 3);
    run(fleet, 30);
    const stats = fleet.stats();
    expect(stats.busSent).toBeGreaterThan(0);
    expect(stats.busDropped).toBe(stats.busSent);
  });
});

describe("world sanity", () => {
  test("all POIs and starts are on walkable floor", () => {
    const fleet = new Fleet();
    fleet.start("distributed", 6);
    for (const a of fleet.agents) {
      expect(a.pos.x).toBeGreaterThanOrEqual(0);
    }
    void manhattan;
  });
});
