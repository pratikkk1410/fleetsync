import { useEffect, useRef } from "react";
import {
  GRID_W,
  GRID_H,
  grid,
  BAYS,
  STATIONS,
  CHARGER,
} from "@/simulation/world";
import type { AMRAgent } from "@/simulation/agent";

const CELL = 34;
const PAD = 6;

const STATUS_BG: Record<string, string> = {
  idle: "#d3f462",
  "to-pickup": "#2f6bff",
  "to-dropoff": "#7a4dff",
  waiting: "#ffcf00",
  detour: "#ff9f1c",
  "to-charge": "#00a878",
  charging: "#00a878",
  failed: "#ff4d2e",
};

interface Props {
  agents: AMRAgent[];
  tick: number;
}

/** Neobrutalist warehouse map renderer (HTML5 canvas). */
export function WarehouseMap({ agents, tick }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = (GRID_W * CELL + PAD * 2) * dpr;
    canvas.height = (GRID_H * CELL + PAD * 2) * dpr;
    canvas.style.width = `${GRID_W * CELL + PAD * 2}px`;
    canvas.style.height = `${GRID_H * CELL + PAD * 2}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Floor.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, GRID_W * CELL + PAD * 2, GRID_H * CELL + PAD * 2);

    // Grid cells.
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const px = PAD + x * CELL;
        const py = PAD + y * CELL;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px, py, CELL, CELL);
        ctx.strokeStyle = "rgba(10,10,10,0.10)";
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);

        if (grid[y][x] === "rack") {
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = "#0a0a0a";
          ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
        }
      }
    }

    // POI markers.
    const drawPoi = (x: number, y: number, color: string, label: string) => {
      const px = PAD + x * CELL;
      const py = PAD + y * CELL;
      ctx.fillStyle = color;
      ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6);
      ctx.fillStyle = "#0a0a0a";
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, px + CELL / 2, py + CELL - 7);
    };
    BAYS.forEach((b) => drawPoi(b.x, b.y, "#ffd7be", "BAY"));
    STATIONS.forEach((s) => drawPoi(s.x, s.y, "#d3f462", s.id.slice(-1)));
    drawPoi(CHARGER.x, CHARGER.y, "#00a878", "⚡");

    // Planned paths.
    for (const a of agents) {
      const path = a.plannedPathCells();
      if (path.length < 2) continue;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      path.forEach((c, i) => {
        const px = PAD + c.x * CELL + CELL / 2;
        const py = PAD + c.y * CELL + CELL / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Robots.
    for (const a of agents) {
      const px = PAD + a.pos.x * CELL;
      const py = PAD + a.pos.y * CELL;

      if (a.status === "failed") {
        ctx.fillStyle = "#ff4d2e";
        ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8);
        ctx.strokeStyle = "#0a0a0a";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 4, CELL - 8, CELL - 8);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("✕", px + CELL / 2, py + CELL / 2 + 4);
        continue;
      }

      // Battery ring hint: bottom bar.
      ctx.fillStyle = STATUS_BG[a.status] ?? "#d3f462";
      ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);

      // Battery bar.
      const bw = (CELL - 8) * (a.battery / 100);
      ctx.fillStyle = a.battery > 40 ? "#0a0a0a" : "#ff4d2e";
      ctx.fillRect(px + 4, py + CELL - 8, Math.max(2, bw), 4);

      // ID.
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      const idLabel = a.label.replace("AMR-", "");
      ctx.fillText(idLabel, px + CELL / 2, py + CELL / 2 + 1);

      // Load icon.
      if (a.status === "to-dropoff") {
        ctx.fillStyle = "#ffcf00";
        ctx.fillRect(px + CELL - 10, py + 4, 6, 6);
        ctx.strokeStyle = "#0a0a0a";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + CELL - 10, py + 4, 6, 6);
      }
    }

    // Clock badge.
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(GRID_W * CELL + PAD * 2 - 74, 10, 64, 22);
    ctx.fillStyle = "#d3f462";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`T+${tick}`, GRID_W * CELL + PAD * 2 - 42, 25);
  }, [agents, tick]);

  return (
    <div className="inline-block nb-border-4 nb-shadow-lg bg-white p-0">
      <canvas ref={ref} className="warehouse-canvas block" />
    </div>
  );
}
