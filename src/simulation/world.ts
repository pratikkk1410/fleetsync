/**
 * Warehouse world definition.
 * Grid world with storage racks (obstacles), picking stations, and a charging dock.
 * Single source of truth shared by all robot agents and the dashboard.
 */

export const GRID_W = 20;
export const GRID_H = 14;

// 0 = floor (drivable), 1 = rack (obstacle)
const RACK_LAYOUT = [
  "....................",
  ".xxxxx..xxxxx..xxxx.",
  ".xxxxx..xxxxx..xxxx.",
  ".xxxxx..xxxxx..xxxx.",
  "....................",
  ".....x......x.......",
  ".....x......x.......",
  "....................",
  ".xxxxx..xxxxx..xxxx.",
  ".xxxxx..xxxxx..xxxx.",
  ".xxxxx..xxxxx..xxxx.",
  "....................",
  "....................",
  "....................",
];

export type CellType = "floor" | "rack";

function buildGrid(): CellType[][] {
  const grid: CellType[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < GRID_W; x++) {
      const ch = RACK_LAYOUT[y][x];
      row.push(ch === "x" ? "rack" : "floor");
    }
    grid.push(row);
  }
  return grid;
}

export const grid: CellType[][] = buildGrid();

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  return grid[y][x] === "floor";
}

export function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Picking stations where goods are handed over. */
export const STATIONS: { id: string; x: number; y: number }[] = [
  { id: "ST-A", x: 7, y: 0 },
  { id: "ST-B", x: 13, y: 0 },
  { id: "ST-C", x: 19, y: 7 },
  { id: "ST-D", x: 0, y: 7 },
  { id: "ST-E", x: 8, y: 13 },
  { id: "ST-F", x: 12, y: 13 },
];

/** Delivery bays (sources of jobs). */
export const BAYS: { id: string; x: number; y: number }[] = [
  { id: "BAY-1", x: 1, y: 13 },
  { id: "BAY-2", x: 18, y: 1 },
  { id: "BAY-3", x: 10, y: 13 },
  { id: "BAY-4", x: 0, y: 1 },
];

/** Charging dock. */
export const CHARGER = { x: 5, y: 13 };

/** Interest points a robot may be sent to: stations, bays, charger. */
export const POI = [...STATIONS.map((s) => ({ ...s, kind: "station" as const })), ...BAYS.map((b) => ({ ...b, kind: "bay" as const })), { ...CHARGER, id: "CHARGE", kind: "charge" as const }];

export function cellHasPOI(x: number, y: number): string | null {
  for (const p of POI) {
    if (p.x === x && p.y === y) return p.id;
  }
  return null;
}
