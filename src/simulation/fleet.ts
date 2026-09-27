/**
 * Fleet orchestrator — runs the discrete-tick simulation.
 *
 * Two modes:
 *  - "distributed": each AMR is an autonomous edge agent (A*, reservations,
 *    peer messages, EdgeAI, re-routing, task claims, failure recovery).
 *  - "baseline": classical stop-and-wait with a central dispatcher assigning
 *    tasks round-robin; robots stop when blocked and never negotiate.
 */

import { AMRAgent, type RobotTelemetry } from "./agent";
import { MessageBus } from "./bus";
import { createReservationTable, pruneReservations, type Vec } from "./planner";
import { BAYS, STATIONS, manhattan } from "./world";

function bayPos(bayId: string): Vec {
  const b = BAYS.find((x) => x.id === bayId);
  return b ? { x: b.x, y: b.y } : BAYS[0];
}
export type FleetMode = "distributed" | "baseline";

export interface Job {
  id: string;
  bayId: string;
  stationId: string;
  claimedBy: string | null;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface SimEvent {
  tick: number;
  kind: "task" | "conflict" | "reroute" | "deadlock" | "fail" | "recover" | "charge" | "info";
  robot: string | null;
  message: string;
}

export interface TickMetrics {
  tick: number;
  throughput: number;
  avgWait: number;
  active: number;
  congestion: number;
}

export interface FleetStats {
  tasksCompleted: number;
  tasksPending: number;
  reroutes: number;
  waits: number;
  deadlocksResolved: number;
  avgTaskTime: number;
  busSent: number;
  busDropped: number;
  busDroppedPct: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class Fleet {
  mode: FleetMode = "distributed";
  tick = 0;
  agents: AMRAgent[] = [];
  jobs: Job[] = [];
  events: SimEvent[] = [];
  history: TickMetrics[] = [];
  bus: MessageBus;
  res = createReservationTable();
  private jobCounter = 0;
  private completions: number[] = [];
  private lastJobTick = 0;

  constructor(opts: { lossRate?: number } = {}) {
    this.bus = new MessageBus({ lossRate: opts.lossRate ?? 0.06, maxDelay: 2 });
  }

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------

  start(mode: FleetMode, fleetSize = 4) {
    this.mode = mode;
    this.tick = 0;
    this.agents = [];
    this.jobs = [];
    this.events = [];
    this.history = [];
    this.completions = [];
    this.jobCounter = 0;
    this.bus.reset();
    this.res = createReservationTable();

    const starts: Vec[] = [
      { x: 1, y: 5 },
      { x: 18, y: 7 },
      { x: 9, y: 4 },
      { x: 9, y: 11 },
      { x: 2, y: 11 },
      { x: 17, y: 11 },
    ];
    const colors = ["#2f6bff", "#ff4d2e", "#00a878", "#ffcf00", "#7a4dff", "#d3f462"];
    const labels = ["AMR-01", "AMR-02", " AMR-03", "AMR-04", "AMR-05", "AMR-06"];

    for (let i = 0; i < fleetSize; i++) {
      const agent = new AMRAgent({
        id: `amr-${i + 1}`,
        label: labels[i].trim(),
        color: colors[i % colors.length],
        start: starts[i % starts.length],
        priority: fleetSize - i,
        bus: this.bus,
        res: this.res,
      });
      agent.onComplete = (jobId) => this.notifyTaskComplete(jobId, agent.id);
      this.agents.push(agent);
    }
  }

  setMode(mode: FleetMode) {
    this.start(mode, Math.max(3, this.agents.length));
  }

  setFleetSize(n: number) {
    this.start(this.mode, Math.max(3, Math.min(6, n)));
  }

  // ------------------------------------------------------------------
  // Job injection and robot controls (demo actions)
  // ------------------------------------------------------------------

  /** Inject one job (stand-in for the warehouse management system). */
  injectJob(): Job {
    const job: Job = {
      id: `T${String(++this.jobCounter).padStart(3, "0")}`,
      bayId: pick(BAYS).id,
      stationId: pick(STATIONS).id,
      claimedBy: null,
      done: false,
      createdAt: this.tick,
      completedAt: null,
    };
    this.jobs.push(job);
    this.log("task", null, `New job ${job.id}: ${job.bayId} → ${job.stationId}`);
    return job;
  }

  injectBurst(n: number) {
    for (let i = 0; i < n; i++) this.injectJob();
  }

  /** Kill a robot mid-mission — demonstrates distributed failure recovery. */
  failRobot(id: string) {
    const a = this.agents.find((x) => x.id === id);
    if (a && a.status !== "failed") a.scheduleFailure(this.tick + 1);
  }

  reviveRobot(id: string) {
    const a = this.agents.find((x) => x.id === id);
    if (a && a.status === "failed") {
      a.status = "idle";
      a.battery = Math.max(a.battery, 30);
      a.task = null;
      a.plan = null;
      a.goal = null;
      this.log("recover", a.id, "back online");
    }
  }

  /** Toggle simulated Wi-Fi dead zones: raise packet loss temporarily. */
  setLossRate(rate: number) {
    this.bus.lossRate = rate;
  }

  // ------------------------------------------------------------------
  // Simulation loop
  // ------------------------------------------------------------------

  /** Advance the whole simulation one tick. */
  step() {
    this.tick++;

    // Auto-inject a job every ~12 ticks to keep the floor busy.
    if (this.tick - this.lastJobTick >= 12) {
      this.injectJob();
      this.lastJobTick = this.tick;
    }

    // 1. Network: deliver due peer messages (packet loss/latency applied).
    this.bus.pump(this.tick);
    pruneReservations(this.res, this.tick);

    // 2. Task claims — agents see the shared job board and try to claim.
    //    (In a real deployment this board is also replicated peer-to-peer;
    //     here it is a stand-in for the warehouse job stream.)
    for (const job of this.jobs) {
      if (job.claimedBy || job.done) continue;
      if (this.mode === "baseline") {
        // Central dispatcher: nearest idle robot, assigned top-down.
        const idle = this.agents
          .filter((a) => a.status === "idle" && !a.task && a.battery > 20)
          .sort((a, b) => manhattan(a.pos, bayPos(job.bayId)) - manhattan(b.pos, bayPos(job.bayId)))[0];
        if (idle) {
          idle.assignExternal(job.id, job.bayId, job.stationId, this.tick);
          job.claimedBy = idle.id;
        }
      } else {
        // Distributed: agents decide; orchestrator only observes.
        for (const a of this.agents) {
          if (a.status !== "failed" && a.offerTask({ id: job.id, bayId: job.bayId, stationId: job.stationId, age: this.tick - job.createdAt }, this.tick)) {
            job.claimedBy = a.id;
            this.log("task", a.id, `claimed ${job.id} autonomously`);
            break;
          }
        }
      }
    }

    // 3. Tick each agent (perceive → decide → act).
    for (const a of this.agents) {
      a.step(this.tick);
    }

    // 4. Detect inter-robot conflicts this tick for the event log/metrics.
    this.detectEvents();

    // 5. Record metrics.
    this.recordHistory();
  }

  private detectEvents() {
    // Near-collision detection: two live robots in the same or adjacent-swapped cells.
    for (let i = 0; i < this.agents.length; i++) {
      for (let j = i + 1; j < this.agents.length; j++) {
        const a = this.agents[i];
        const b = this.agents[j];
        if (a.status === "failed" || b.status === "failed") continue;
        const same = a.pos.x === b.pos.x && a.pos.y === b.pos.y;
        const swapped =
          manhattan(a.pos, b.pos) === 1 &&
          a.plan && b.plan &&
          a.plan.cells.length > 1 && b.plan.cells.length > 1 &&
          a.plan.cells[1].x === b.pos.x && a.plan.cells[1].y === b.pos.y &&
          b.plan.cells[1].x === a.pos.x && b.plan.cells[1].y === a.pos.y;
        if (same || swapped) {
          this.log("conflict", a.id, `conflict with ${b.id} at (${a.pos.x},${a.pos.y}) — negotiated`);
        }
      }
    }
    // Reroute / deadlock events from agent counters.
    for (const a of this.agents) {
      if (a.status === "detour" && !this.detourLogged.has(a.id)) {
        this.detourLogged.add(a.id);
        this.log("reroute", a.id, "re-routed around congestion");
      }
      if (a.status !== "detour") this.detourLogged.delete(a.id);
    }
  }
  private detourLogged = new Set<string>();

  private recordHistory() {
    const live = this.agents.filter((a) => a.status !== "failed");
    const active = live.filter((a) => a.task !== null).length;
    const avgWait = live.length ? live.reduce((s, a) => s + a.waits, 0) / live.length : 0;
    const congestion = live.length ? live.reduce((s, a) => s + a.ai.p, 0) / live.length : 0;
    this.history.push({
      tick: this.tick,
      throughput: this.completions.length,
      avgWait: Math.round(avgWait * 10) / 10,
      active,
      congestion: Math.round(congestion * 100) / 100,
    });
    if (this.history.length > 240) this.history.shift();
  }

  private log(kind: SimEvent["kind"], robot: string | null, message: string) {
    this.events.push({ tick: this.tick, kind, robot, message });
    if (this.events.length > 60) this.events.shift();
  }

  // ------------------------------------------------------------------
  // Exposed state for the dashboard (observer only)
  // ------------------------------------------------------------------

  telemetry(): RobotTelemetry[] {
    return this.agents.map((a) => a.telemetry());
  }

  stats(): FleetStats {
    const completed = this.jobs.filter((j) => j.done).length;
    const pending = this.jobs.filter((j) => !j.claimedBy && !j.done).length;
    const reroutes = this.agents.reduce((s, a) => s + a.reroutes, 0);
    const waits = this.agents.reduce((s, a) => s + a.waits, 0);
    const deadlocks = this.agents.reduce((s, a) => s + a.yields, 0);
    const avgTaskTime = this.completions.length
      ? this.completions.reduce((s, d) => s + d, 0) / this.completions.length
      : 0;
    return {
      tasksCompleted: completed,
      tasksPending: pending,
      reroutes,
      waits,
      deadlocksResolved: deadlocks,
      avgTaskTime: Math.round(avgTaskTime * 10) / 10,
      busSent: this.bus.sent,
      busDropped: this.bus.dropped,
      busDroppedPct: this.bus.sent ? Math.round((this.bus.dropped / this.bus.sent) * 100) : 0,
    };
  }

  /** Completion count snapshot used for charts. */
  throughputSeries(): { tick: number; total: number }[] {
    return this.history.map((h) => ({ tick: h.tick, total: h.throughput }));
  }

  /** Called whenever an agent finishes a job — updates job board + timers. */
  notifyTaskComplete(jobId: string, byId: string) {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job && !job.done) {
      job.done = true;
      job.completedAt = this.tick;
      this.completions.push(this.tick - job.createdAt);
      this.log("info", byId, `delivered ${jobId} in ${this.tick - job.createdAt} ticks`);
    }
  }
}
