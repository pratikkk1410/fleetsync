import { isWalkable, manhattan } from "./world";

export interface Vec {
  x: number;
  y: number;
}

export interface PlannedPath {
  cells: Vec[];
  /** Simulated tick each cell is committed to (aligned to path index). */
  times: number[];
  eta: number;
}

/**
 * Shared reservation table (space + time).
 * reserved: tick -> (cellKey -> robotId)
 * parked:   cellKey -> robotId, for a robot's final resting cell.
 */
export interface Reservation {
  reserved: Map<number, Map<string, string>>;
  parked: Map<string, string>;
}

export function createReservationTable(): Reservation {
  return { reserved: new Map(), parked: new Map() };
}

function cellKey(v: Vec): string {
  return `${v.x},${v.y}`;
}

/** Register an agent's plan into the shared table (the broadcast equivalent). */
export function commitPlan(res: Reservation, robotId: string, plan: PlannedPath) {
  removePlan(res, robotId);
  plan.cells.forEach((c, i) => {
    const t = plan.times[i];
    let m = res.reserved.get(t);
    if (!m) {
      m = new Map();
      res.reserved.set(t, m);
    }
    m.set(cellKey(c), robotId);
  });
  if (plan.cells.length > 0) {
    res.parked.set(cellKey(plan.cells[plan.cells.length - 1]), robotId);
  }
}

export function removePlan(res: Reservation, robotId: string) {
  for (const [t, m] of [...res.reserved]) {
    for (const [cell, rid] of [...m]) {
      if (rid === robotId) m.delete(cell);
    }
    if (m.size === 0) res.reserved.delete(t);
  }
  for (const [cell, rid] of [...res.parked]) {
    if (rid === robotId) res.parked.delete(cell);
  }
}

/** Drop stale reservations to keep the table small. */
export function pruneReservations(res: Reservation, currentTick: number) {
  for (const t of [...res.reserved.keys()]) {
    if (t < currentTick - 2) res.reserved.delete(t);
  }
}

export interface Conflict {
  tick: number;
  x: number;
  y: number;
  withRobot: string;
}

/** Check a candidate path against OTHER robots' reservations. */
function checkConflicts(plan: PlannedPath, res: Reservation, self: string): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < plan.cells.length; i++) {
    const t = plan.times[i];
    const c = plan.cells[i];
    const ck = cellKey(c);

    // 1. Same cell, same tick (head-on / crossing / rear-end).
    const atT = res.reserved.get(t);
    if (atT) {
      for (const [cell, rid] of atT) {
        if (rid !== self && cell === ck) {
          conflicts.push({ tick: t, x: c.x, y: c.y, withRobot: rid });
        }
      }
    }

    // 2. Swap: I move prev->c while another robot moves c->prev.
    if (i > 0) {
      const prev = plan.cells[i - 1];
      const tPrev = plan.times[i - 1];
      const otherAtCPrev = res.reserved.get(tPrev)?.get(ck);
      const otherAtPrevT = res.reserved.get(t)?.get(cellKey(prev));
      if (otherAtCPrev && otherAtCPrev !== self && otherAtPrevT && otherAtPrevT !== self) {
        conflicts.push({ tick: t, x: c.x, y: c.y, withRobot: otherAtCPrev });
      }
    }

    // 3. Parked robot occupying the cell indefinitely.
    const parkedBy = res.parked.get(ck);
    if (parkedBy && parkedBy !== self) {
      conflicts.push({ tick: t, x: c.x, y: c.y, withRobot: parkedBy });
    }
  }
  return conflicts;
}

/** Pure A* over the static grid (4-connected). */
export function astar(start: Vec, goal: Vec): Vec[] | null {
  if (!isWalkable(goal.x, goal.y) || !isWalkable(start.x, start.y)) return null;
  const open: { pos: Vec; f: number }[] = [{ pos: start, f: manhattan(start, goal) }];
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();
  gScore.set(cellKey(start), 0);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!.pos;
    const ck = cellKey(current);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (current.x === goal.x && current.y === goal.y) {
      const path: Vec[] = [];
      let k: string | undefined = ck;
      while (k) {
        const [x, y] = k.split(",").map(Number);
        path.push({ x, y });
        k = cameFrom.get(k);
      }
      return path.reverse();
    }

    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (const d of dirs) {
      const nx = current.x + d.x;
      const ny = current.y + d.y;
      if (!isWalkable(nx, ny)) continue;
      const nk = `${nx},${ny}`;
      const tentative = (gScore.get(ck) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, ck);
        open.push({ pos: { x: nx, y: ny }, f: tentative + manhattan({ x: nx, y: ny }, goal) });
      }
    }
  }
  return null;
}

export interface PlanOptions {
  selfId: string;
  start: Vec;
  goal: Vec;
  startTick: number;
  res: Reservation;
}

/**
 * Plan a space-time path: plain A* shifted by optional start-waits.
 * Prefers the conflict-free plan with the earliest ETA; otherwise the
 * least-conflicting one (the agent layer keeps re-planning at runtime).
 */
export function planPath(opts: PlanOptions): PlannedPath | null {
  const { selfId, start, goal, startTick, res } = opts;
  const base = astar(start, goal);
  if (!base) return null;

  const buildPlan = (waitTicks: number): PlannedPath => {
    const cells: Vec[] = [];
    const times: number[] = [];
    let t = startTick;
    for (let w = 0; w < waitTicks; w++) {
      cells.push({ ...start });
      times.push(t);
      t += 1;
    }
    for (const c of base) {
      cells.push({ ...c });
      times.push(t);
      t += 1;
    }
    return { cells, times, eta: times[times.length - 1] };
  };

  let best: PlannedPath | null = null;
  let bestScore = Infinity;
  for (let w = 0; w <= 4; w++) {
    const cand = buildPlan(w);
    const conflicts = checkConflicts(cand, res, selfId);
    // Conflicts imminent (within 3 ticks) are much worse than far ones.
    const score = conflicts.reduce((acc, c) => acc + (c.tick - startTick < 3 ? 5 : 1), 0);
    if (score < bestScore || (score === bestScore && best && cand.eta < best.eta)) {
      best = cand;
      bestScore = score;
    }
    if (score === 0) break; // earliest conflict-free plan wins
  }
  return best;
}

/** Count other robots' reservations crossing my path within a tick window. */
export function congestionAhead(
  res: Reservation,
  selfId: string,
  path: Vec[],
  fromTick: number,
  window = 8,
): number {
  if (path.length === 0) return 0;
  const pathKeys = new Set(path.map(cellKey));
  let count = 0;
  for (const [tick, m] of res.reserved) {
    if (tick < fromTick || tick > fromTick + window) continue;
    for (const [cell, rid] of m) {
      if (rid === selfId) continue;
      if (pathKeys.has(cell)) count++;
    }
  }
  return count;
}
