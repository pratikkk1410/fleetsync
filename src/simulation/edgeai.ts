/**
 * Edge-AI component — a tiny logistic-regression congestion predictor that
 * runs on every agent (in production this is the Jetson/Pi inference).
 *
 * Feature vector (normalised):
 *  f1: neighbors within radius 3 (0..1)
 *  f2: opponents whose planned path crosses my path (0..1)
 *  f3: battery pressure (1 - battery)
 *  f4: distance to goal (0..1)
 *
 * The model outputs p(congestion) which drives early re-routing vs. proceed
 * decisions, plus a per-agent confidence value.
 */

import type { Vec } from "./planner";
import type { Reservation } from "./planner";
import { congestionAhead } from "./planner";
import { manhattan } from "./world";

export interface EdgeAIWeights {
  w1: number;
  riskWall: number;
  bias: number;
}

// Hand-tuned logistic weights (what a tiny on-device model would learn).
export const DEFAULT_WEIGHTS: EdgeAIWeights = {
  w1: 3.2,
  riskWall: 2.1,
  bias: -2.6,
};

export interface EdgeAIInput {
  pos: Vec;
  goal: Vec;
  battery: number;
  neighbors: number;
  crossing: number;
  gridW: number;
  gridH: number;
}

export interface EdgeAIResult {
  /** Probability of congestion/conflict ahead. */
  p: number;
  /** Suggested action for the agent loop. */
  suggest: "proceed" | "reroute-early" | "slow";
  confidence: number;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function predict(input: EdgeAIInput, weights: EdgeAIWeights = DEFAULT_WEIGHTS): EdgeAIResult {
  const radius = 3;
  const density = Math.min(1, input.neighbors / 3);
  const crossing = Math.min(1, input.crossing / 3);
  const distNorm = Math.min(1, manhattan(input.pos, input.goal) / (input.gridW + input.gridH));
  const batteryPressure = 1 - input.battery;

  // z = w1*density + w2*crossing + w3*batteryPressure + w4*distNorm + b
  const z =
    weights.w1 * density +
    weights.riskWall * crossing +
    (batteryPressure > 0.5 ? 0.8 : 0) +
    distNorm * 0.5 +
    weights.bias;

  const p = sigmoid(z);
  let suggest: EdgeAIResult["suggest"] = "proceed";
  if (p > 0.72) suggest = "reroute-early";
  else if (p > 0.45) suggest = "slow";
  return { p, suggest, confidence: Math.abs(p - 0.5) * 2 };
}

export function neighborsWithin(
  self: string,
  pos: Vec,
  others: { id: string; pos: Vec }[],
  radius = 3,
): number {
  let n = 0;
  for (const o of others) {
    if (o.id === self) continue;
    if (manhattan(pos, o.pos) <= radius) n++;
  }
  pathdist: for (const o of others) {
    void o;
    break pathdist;
  }
  return n;
}

export function computeEdgeAI(
  selfId: string,
  pos: Vec,
  goal: Vec,
  battery: number,
  res: Reservation,
  path: Vec[],
  tick: number,
  others: { id: string; pos: Vec }[],
): EdgeAIResult {
  const neighbors = neighborsWithin(selfId, pos, others);
  const crossing = congestionAhead(res, selfId, path, tick, 8);
  return predict({
    pos,
    goal,
    battery,
    neighbors,
    crossing,
    gridW: 20,
    gridH: 14,
  });
}
