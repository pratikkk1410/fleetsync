import { describe, expect, test } from "bun:test";
import {
  astar,
  planPath,
  commitPlan,
  removePlan,
  createReservationTable,
  congestionAhead,
} from "./planner";
import { isWalkable } from "./world";

describe("astar", () => {
  test("finds a straight path on open floor", () => {
    const path = astar({ x: 2, y: 5 }, { x: 6, y: 5 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1 + Math.abs(6 - 2)); // 4-connected Manhattan cost
    expect(path![0]).toEqual({ x: 2, y: 5 });
    expect(path![path!.length - 1]).toEqual({ x: 6, y: 5 });
  });

  test("routes around racks", () => {
    // Row y=4 is a solid rack band except x=0 and x=19; a path from below to
    // above must exist and never step on a rack.
    const path = astar({ x: 2, y: 5 }, { x: 2, y: 2 });
    expect(path).not.toBeNull();
    for (const c of path!) {
      expect(isWalkable(c.x, c.y)).toBe(true);
    }
    expect(path![0]).toEqual({ x: 2, y: 5 });
    expect(path![path!.length - 1]).toEqual({ x: 2, y: 2 });
  });

  test("returns null when goal is inside a rack", () => {
    const path = astar({ x: 2, y: 4 + 1 }, { x: 2, y: 4 });
    expect(path).toBeNull();
  });
});

describe("reservation table", () => {
  test("commitPlan then removePlan leaves no trace for that robot", () => {
    const res = createReservationTable();
    const plan = planPath({
      selfId: "a",
      start: { x: 1, y: 5 },
      goal: { x: 5, y: 5 },
      startTick: 0,
      res,
    })!;
    expect(plan).not.toBeNull();
    commitPlan(res, "a", plan);
    const before = countReservations(res);
    expect(before).toBeGreaterThan(0);
    removePlan(res, "a");
    expect(countReservations(res)).toBe(0);
  });

  test("conflict detection flags same cell same tick between two robots", () => {
    const res = createReservationTable();
    // Robot B sits at (3,5) at tick 2 (its plan: wait in place then park).
    const planB = {
      cells: [
        { x: 3, y: 5 },
        { x: 3, y: 5 },
        { x: 3, y: 5 },
      ],
      times: [0, 1, 2],
      eta: 2,
    };
    commitPlan(res, "b", planB);
    // Robot A plans straight through (3,5) arriving tick 2 -> conflict with b.
    const planA = planPath({
      selfId: "a",
      start: { x: 1, y: 5 },
      goal: { x: 6, y: 5 },
      startTick: 0,
      res,
    })!;
    expect(planA).not.toBeNull();
    // A must not be at (3,5) at exactly tick 2 (B's parked cell).
    const clash = planA.cells.some((c, i) => c.x === 3 && c.y === 5 && planA.times[i] === 2);
    expect(clash).toBe(false);
  });

  test("planner prefers earliest conflict-free plan", () => {
    const res = createReservationTable();
    // B crosses (4,5) at tick 3 only.
    const planB = {
      cells: [
        { x: 4, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 5 },
      ],
      times: [0, 1, 2, 3],
      eta: 3,
    };
    commitPlan(res, "b", planB);
    const planA = planPath({
      selfId: "a",
      start: { x: 1, y: 5 },
      goal: { x: 8, y: 5 },
      startTick: 0,
      res,
    })!;
    const atConflict = planA.cells.some((c, i) => c.x === 4 && c.y === 5 && planA.times[i] === 3);
    expect(atConflict).toBe(false);
  });
});

describe("congestionAhead", () => {
  test("counts only other robots' crossings in the window", () => {
    const res = createReservationTable();
    const mine = {
      cells: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
      times: [0, 1, 2],
      eta: 2,
    };
    commitPlan(res, "me", mine);
    commitPlan(
      res,
      "other",
      {
        cells: [
          { x: 2, y: 5 },
          { x: 2, y: 5 },
          { x: 2, y: 5 },
        ],
        times: [0, 1, 2],
        eta: 2,
      },
    );
    const n = congestionAhead(res, "me", mine.cells, 0, 8);
    expect(n).toBe(3); // other occupies (2,5) at ticks 0,1,2 — all within window
  });
});

function countReservations(res: { reserved: Map<number, Map<string, string>>; parked: Map<string, string> }): number {
  let n = 0;
  for (const m of res.reserved.values()) n += m.size;
  return n + res.parked.size;
}
