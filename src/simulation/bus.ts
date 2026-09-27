/**
 * Message bus — the peer-to-peer communication layer.
 *
 * In production each agent runs in its own process/container talking
 * WebSocket/MQTT to peers. Here a single in-memory bus with a configurable
 * message drop rate simulates an unreliable warehouse Wi-Fi network
 * (packet loss, latency) without changing any agent logic: agents only
 * ever learn about peers through this bus.
 */

export type MsgKind = "state" | "intent" | "reroute" | "task-claim" | "fail-alert" | "heartbeat";

export interface AgentMsg {
  from: string;
  kind: MsgKind;
  tick: number;
  payload: Record<string, unknown>;
}

export interface BusOptions {
  /** Simulated packet loss 0..1. */
  lossRate?: number;
  /** Max latency in ticks before delivery. */
  maxDelay?: number;
}

export class MessageBus {
  private subscribers = new Map<string, (m: AgentMsg) => void>();
  private queue: { deliverAt: number; msg: AgentMsg }[] = [];
  lossRate: number;
  maxDelay: number;
  /** Stats for the dashboard. */
  sent = 0;
  dropped = 0;
  delivered = 0;

  constructor(opts: BusOptions = {}) {
    this.lossRate = opts.lossRate ?? 0.08;
    this.maxDelay = opts.maxDelay ?? 2;
  }

  subscribe(id: string, cb: (m: AgentMsg) => void) {
    this.subscribers.set(id, cb);
  }

  unsubscribe(id: string) {
    this.subscribers.delete(id);
  }

  /** Publish to all peers (broadcast), simulating Wi-Fi multicast. */
  publish(msg: AgentMsg) {
    this.sent++;
    if (Math.random() < this.lossRate) {
      this.dropped++;
      return;
    }
    const delay = Math.floor(Math.random() * (this.maxDelay + 1));
    this.queue.push({ deliverAt: msg.tick + delay, msg });
  }

  /** Direct message to one peer (used for task claims / reroute alerts). */
  sendTo(to: string, msg: AgentMsg) {
    this.sent++;
    if (Math.random() < this.lossRate) {
      this.dropped++;
      return;
    }
    const delay = Math.floor(Math.random() * (this.maxDelay + 1));
    this.queue.push({ deliverAt: msg.tick + delay, msg: { ...msg, payload: { ...msg.payload, to } } });
  }

  /** Called once per tick; delivers due messages. */
  pump(currentTick: number) {
    const due: AgentMsg[] = [];
    this.queue = this.queue.filter((item) => {
      if (item.deliverAt <= currentTick) {
        due.push(item.msg);
        return false;
      }
      return true;
    });
    for (const m of due) {
      const target = (m.payload.to as string | undefined) ?? null;
      if (target) {
        const cb = this.subscribers.get(target);
        if (cb) {
          cb(m);
          this.delivered++;
        }
      } else {
        for (const cb of this.subscribers.values()) {
          cb(m);
          this.delivered++;
        }
      }
    }
  }

  reset() {
    this.queue = [];
    this.sent = 0;
    this.dropped = 0;
    this.delivered = 0;
  }
}
