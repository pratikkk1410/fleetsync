/**
 * AMR edge agent — the robot's own "brain".
 *
 * Runs a perceive -> decide -> act loop. Knows ONLY:
 *  - its own state (position, battery, task, plan)
 *  - what it hears from peers via the MessageBus (state/intents/fail alerts)
 *  - the static warehouse map
 *
 * It does NOT ask a central server what to do. All movement decisions are
 * made locally with peer info gathered over the bus. The dashboard is a
 * passive observer of telemetry.
 */

import {
  type PlannedPath,
  type Reservation,
  type Vec,
  commitPlan,
  congestionAhead,
  planPath,
  removePlan,
} from "./planner";
import { computeEdgeAI, type EdgeAIResult } from "./edgeai";
import { type AgentMsg, type MessageBus } from "./bus";
import { BAYS, CHARGER, STATIONS, isWalkable, manhattan } from "./world";

export type RobotStatus =
  | "idle"
  | "to-pickup"
  | "to-dropoff"
  | "waiting"
  | "detour"
  | "to-charge"
  | "charging"
  | "failed";

export interface Task {
  id: string;
  bayId: string;
  stationId: string;
  /** Ticks the task has existed (for priority aging). */
  age: number;
}

export interface RobotTelemetry {
  id: string;
  pos: Vec;
  status: RobotStatus;
  battery: number;
  taskId: string | null;
  destination: string | null;
  pathLength: number;
  eta: number | null;
  priority: number;
  congestion: number;
  edgeAI: { p: number; suggest: string };
  waits: number;
  reroutes: number;
  tasksDone: number;
  loadCarried: number | null;
}

/** Another robot's last known state, as heard over the bus. */
interface PeerView {
  id: string;
  pos: Vec;
  status: RobotStatus;
  battery: number;
  priority: number;
  taskId: string | null;
  path: Vec[];
  tick: number;
}

export interface AgentOptions {
  id: string;
  label: string;
  color: string;
  start: Vec;
  priority: number;
  bus: MessageBus;
  res: Reservation;
}

const TICKS_PER_STEP = 1;

export class AMRAgent {
  id: string;
  label: string;
  color: string;
  pos: Vec;
  status: RobotStatus = "idle";
  battery = 100;
  priority: number;
  task: Task | null = null;
  plan: PlannedPath | null = null;
  goal: Vec | null = null;
  waits = 0;
  reroutes = 0;
  tasksDone = 0;
  yields = 0;
  /** Set by the orchestrator; called when this agent delivers a job. */
  onComplete: ((jobId: string) => void) | null = null;
  /** Current EdgeAI verdict. */
  ai: EdgeAIResult = { p: 0, suggest: "proceed", confidence: 0 };

  private bus: MessageBus;
  private res: Reservation;
  private peers = new Map<string, PeerView>();
  private claimedTasks = new Set<string>();
  private waitTicks = 0;
  private pausedStatus: RobotStatus | null = null;
  private failAtTick: number | null = null;
  private rng: () => number;

  constructor(opts: AgentOptions) {
    this.id = opts.id;
    this.label = opts.label;
    this.color = opts.color;
    this.pos = { ...opts.start };
    this.priority = opts.priority;
    this.bus = opts.bus;
    this.res = opts.res;
    this.rng = Math.random;
    this.bus.subscribe(this.id, (m) => this.onMessage(m));
    // Claim-free start: everyone publishes immediately so peers know us.
    this.broadcastState(0);
  }

  // ------------------------------------------------------------------
  // Communication (the only way this agent learns about the world)
  // ------------------------------------------------------------------

  private broadcastState(tick: number) {
    this.bus.publish({
      from: this.id,
      kind: "state",
      tick,
      payload: {
        pos: { ...this.pos },
        status: this.status,
        battery: this.battery,
        priority: this.priority,
        taskId: this.task?.id ?? null,
        path: this.plan ? this.plan.cells.map((c) => ({ ...c })) : [],
      },
    });
  }

  private onMessage(m: AgentMsg) {
    if (m.from === this.id) return;
    if (m.kind === "state" || m.kind === "intent") {
      this.peers.set(m.from, {
        id: m.from,
        pos: m.payload.pos as Vec,
        status: m.payload.status as RobotStatus,
        battery: m.payload.battery as number,
        priority: m.payload.priority as number,
        taskId: m.payload.taskId as string | null,
        path: (m.payload.path as Vec[]) ?? [],
        tick: m.tick,
      });
    } else if (m.kind === "fail-alert") {
      // A peer died with a task in flight — try to claim it (auction).
      const failedTaskId = m.payload.taskId as string | null;
      if (failedTaskId && !this.task && this.battery > 25) {
        this.claimedTasks.add(failedTaskId);
        this.bus.publish({
          from: this.id,
          kind: "task-claim",
          tick: m.tick,
          payload: { taskId: failedTaskId, etaHint: manhattan(this.pos, BAYS[0]), battery: this.battery },
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Task assignment (decentralised first-claim with priority tiebreak)
  // ------------------------------------------------------------------

  /** Fleet-level job board injects new tasks; each idle agent tries to claim. */
  offerTask(task: Task, tick: number): boolean {
    if (this.status !== "idle" && this.status !== "charging") return false;
    if (this.claimedTasks.has(task.id)) return false;
    if (this.battery < 20) return false;
    // Simple utility: prefer short distance, higher battery keeps working.
    const bay = BAYS.find((b) => b.id === task.bayId);
    if (!bay) return false;
    const d = manhattan(this.pos, bay);
    const utility = 100 - d * 2 + this.battery * 0.2 + this.priority * 5;
    // Probabilistic claim to avoid all-robots-same-tick ties; stronger robots claim more.
    if (this.rng() < utility / 160) {
      this.task = { ...task };
      this.claimedTasks.add(task.id);
      this.setGoal(this.resolvePickup(), tick);
      this.status = "to-pickup";
      this.broadcastState(tick);
      return true;
    }
    return false;
  }

  /** Baseline mode: a central dispatcher assigns a task to this robot. */
  assignExternal(jobId: string, bayId: string, stationId: string, tick: number) {
    if (this.status !== "idle" || this.task) return;
    this.task = { id: jobId, bayId, stationId, age: 0 };
    this.setGoal(this.resolvePickup(), tick);
    this.status = "to-pickup";
  }

  private resolvePickup(): Vec {
    const bay = BAYS.find((b) => b.id === this.task?.bayId);
    return bay ? { x: bay.x, y: bay.y } : BAYS[0];
  }

  private resolveDropoff(): Vec {
    const st = STATIONS.find((s) => s.id === this.task?.stationId);
    return st ? { x: st.x, y: st.y } : STATIONS[0];
  }

  // ------------------------------------------------------------------
  // Fault injection (demo: kill a robot, watch fleet recover)
  // ------------------------------------------------------------------

  scheduleFailure(tick: number) {
    this.failAtTick = tick;
  }

  private fail(tick: number) {
    const failedTask = this.task?.id ?? null;
    this.status = "failed";
    this.plan = null;
    this.task = null;
    removePlan(this.res, this.id);
    this.bus.publish({
      from: this.id,
      kind: "fail-alert",
      tick,
      payload: { taskId: failedTaskId(failedTask), pos: { ...this.pos } },
    });
  }

  // ------------------------------------------------------------------
  // Perceive -> Decide -> Act
  // ------------------------------------------------------------------

  step(tick: number) {
    if (this.status === "failed") return;

    if (this.failAtTick !== null && tick >= this.failAtTick) {
      this.failAtTick = null;
      this.fail(tick);
      return;
    }

    // 1. PERCEIVE: publish my state, hear peers (bus delivers asynchronously).
    this.broadcastState(tick);

    // 2. Local EdgeAI inference (congestion prediction).
    this.updateEdgeAI(tick);

    // 3. DECIDE + ACT.
    if (!this.plan || this.plan.cells.length === 0) {
      this.decideNewGoal(tick);
      return;
    }
    this.execute(tick);
  }

  private updateEdgeAI(tick: number) {
    const others = [...this.peers.values()].map((p) => ({ id: p.id, pos: p.pos }));
    this.ai = computeEdgeAI(
      this.id,
      this.pos,
      this.goal ?? this.pos,
      this.battery / 100,
      this.res,
      this.plan ? this.plan.cells : [],
      tick,
      others,
    );
  }

  private decideNewGoal(tick: number) {
    if (!this.task) {
      // Nothing to do: head to charger if battery is low, else stay parked.
      if (this.battery < 45 && this.status !== "charging") {
        this.status = "to-charge";
        this.setGoal({ x: CHARGER.x, y: CHARGER.y }, tick);
        return;
      }
      this.status = this.status === "to-charge" && this.battery < 99 ? "charging" : "idle";
      if (this.status === "charging") {
        this.battery = Math.min(100, this.battery + 2.5);
        if (this.battery >= 99) this.status = "idle";
      }
      return;
    }

    if (this.status === "to-pickup") {
      this.setGoal(this.resolvePickup(), tick);
    } else if (this.status === "to-dropoff") {
      this.setGoal(this.resolveDropoff(), tick);
    }
  }

  private setGoal(goal: Vec, tick: number) {
    this.goal = { ...goal };
    const plan = planPath({
      selfId: this.id,
      start: this.pos,
      goal,
      startTick: tick,
      res: this.res,
    });
    if (plan) {
      this.plan = plan;
      commitPlan(this.res, this.id, plan);
    } else {
      this.plan = null;
    }
  }

  /** Follow the plan one step, handling waits, conflicts, and re-routing. */
  private execute(tick: number) {
    if (!this.plan) return;
    const next = this.plan.cells[1] ?? this.plan.cells[0];

    // Time-aware check: is the next cell free at tick+1 per reservations?
    const nextFree = this.isNextCellFree(next, tick);

    // EdgeAI early re-route: if congestion probability is high and there is
    // actually crossing traffic on my remaining path, try an alternative now.
    if (this.ai.suggest === "reroute-early" && congestionAhead(this.res, this.id, this.plan.cells, tick, 6) > 0) {
      if (this.tryReroute(tick)) return;
    }

    if (nextFree) {
      // Move.
      this.pos = { ...next };
      this.plan.cells.shift();
      this.plan.times.shift();
      this.battery = Math.max(0, this.battery - 0.15);
      this.waitTicks = 0;

      if (this.plan.cells.length <= 1) {
        this.arrive(tick);
      }
    } else {
      // Conflict: wait briefly, then try re-route, then priority negotiation.
      this.wait(tick);
    }
  }

  private isNextCellFree(next: Vec, tick: number): boolean {
    for (const [rid, peer] of this.peers) {
      if (rid === this.id) continue;
      // Peer currently sitting on that cell (its broadcast lags <= 2 ticks).
      if (peer.pos.x === next.x && peer.pos.y === next.y) return false;
      // Peer heading into the same cell next tick with higher priority.
      const peerNext = peer.path[1] ?? peer.path[0];
      if (
        peerNext &&
        peerNext.x === next.x &&
        peerNext.y === next.y &&
        (peer.priority > this.priority || (peer.priority === this.priority && peer.id < this.id))
      ) {
        return false;
      }
    }
    return true;
  }

  private wait(tick: number) {
    this.waits++;
    this.waitTicks++;
    const prevStatus = this.status;
    this.status = this.status === "to-pickup" || this.status === "to-dropoff" || this.status === "to-charge" ? "waiting" : this.status;
    // After a short wait, try a dynamic re-route around the blockage.
    if (this.waitTicks >= 2) {
      this.waitTicks = 0;
      if (this.tryReroute(tick)) return;
      // Deadlock suspicion: nobody moved for a while — yield if lower priority.
      if (this.shouldYield()) {
        this.yields++;
        this.priority = Math.max(1, this.priority - 1);
        // Step aside if there is a free adjacent cell.
        this.stepAside(tick);
      }
    }
    if (this.status === "waiting" && this.status !== prevStatus) {
      this.pausedStatus = prevStatus;
    }
    this.battery = Math.max(0, this.battery - 0.02);
  }

  private shouldYield(): boolean {
    // Am I in a mutual wait with a peer heading towards me?
    for (const [rid, peer] of this.peers) {
      if (rid === this.id) continue;
      const facingMe =
        manhattan(peer.pos, this.pos) <= 2 &&
        (peer.path.some((c) => c.x === this.pos.x && c.y === this.pos.y) ?? false);
      if (facingMe && (peer.priority >= this.priority || (peer.priority === this.priority && rid < this.id))) {
        return true;
      }
    }
    return false;
  }

  private stepAside(tick: number) {
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (const d of dirs) {
      const nx = this.pos.x + d.x;
      const ny = this.pos.y + d.y;
      if (!isWalkable(nx, ny)) continue;
      if (!this.isNextCellFree({ x: nx, y: ny }, tick)) continue;
      this.pos = { x: nx, y: ny };
      if (this.goal) this.setGoal(this.goal, tick);
      return;
    }
  }

  private tryReroute(tick: number): boolean {
    if (!this.goal) return false;
    removePlan(this.res, this.id);
    const plan = planPath({
      selfId: this.id,
      start: this.pos,
      goal: this.goal,
      startTick: tick + 1,
      res: this.res,
    });
    if (plan && plan.cells.length > 1) {
      // Only accept if meaningfully different from current plan.
      const curNext = this.plan?.cells[1];
      const newNext = plan.cells[1];
      if (!curNext || !newNext || curNext.x !== newNext.x || curNext.y !== newNext.y) {
        this.plan = plan;
        commitPlan(this.res, this.id, plan);
        this.reroutes++;
        if (this.status === "waiting" && this.pausedStatus) {
          this.status = this.pausedStatus === "waiting" ? (this.task ? "detour" : "to-charge") : this.pausedStatus;
          this.pausedStatus = null;
        }
        this.broadcastIntent(tick);
        return true;
      }
    }
    // Re-commit original plan since reroute rejected.
    if (this.plan) commitPlan(this.res, this.id, this.plan);
    return false;
  }

  private broadcastIntent(tick: number) {
    this.bus.publish({
      from: this.id,
      kind: "intent",
      tick,
      payload: {
        pos: { ...this.pos },
        status: this.status,
        battery: this.battery,
        priority: this.priority,
        taskId: this.task?.id ?? null,
        path: this.plan ? this.plan.cells.map((c) => ({ ...c })) : [],
      },
    });
  }

  private arrive(tick: number) {
    this.plan = null;
    this.pausedStatus = null;
    if (this.status === "to-pickup" && this.task) {
      this.status = "to-dropoff";
      this.setGoal(this.resolveDropoff(), tick);
    } else if (this.status === "to-dropoff" && this.task) {
      this.tasksDone++;
      const jobId = this.task.id;
      this.task = null;
      this.status = "idle";
      this.onComplete?.(jobId);
      this.decideNewGoal(tick);
    } else if (this.status === "to-charge") {
      this.status = "charging";
    }
  }

  // ------------------------------------------------------------------

  telemetry(): RobotTelemetry {
    return {
      id: this.id,
      pos: { ...this.pos },
      status: this.status,
      battery: Math.round(this.battery * 10) / 10,
      taskId: this.task?.id ?? null,
      destination: this.goal ? poiName(this.goal) : null,
      pathLength: this.plan ? this.plan.cells.length : 0,
      eta: this.plan ? this.plan.times[this.plan.times.length - 1] : null,
      priority: this.priority,
      congestion: Math.round(this.ai.p * 100) / 100,
      edgeAI: { p: this.ai.p, suggest: this.ai.suggest },
      waits: this.waits,
      reroutes: this.reroutes,
      tasksDone: this.tasksDone,
      loadCarried: this.status === "to-dropoff" ? 1 : null,
    };
  }

  plannedPathCells(): Vec[] {
    return this.plan ? this.plan.cells : [];
  }

  destroy() {
    this.bus.unsubscribe(this.id);
    removePlan(this.res, this.id);
  }
}

function failedTaskId(id: string | null): string | null {
  return id;
}

function poiName(pos: Vec): string {
  // Resolve a human-readable destination label.
  for (const b of BAYS) if (b.x === pos.x && b.y === pos.y) return b.id;
  for (const s of STATIONS) if (s.x === pos.x && s.y === pos.y) return s.id;
  if (pos.x === CHARGER.x && pos.y === CHARGER.y) return "CHARGE";
  return `${pos.x},${pos.y}`;
}

export { TICKS_PER_STEP };
