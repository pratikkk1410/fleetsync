import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import {
  Activity,
  BatteryCharging,
  Bot,
  Boxes,
  BrainCircuit,
  Gauge,
  GitBranch,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Skull,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Fleet, type FleetMode } from "@/simulation/fleet";
import type { AMRAgent } from "@/simulation/agent";
import { WarehouseMap } from "@/components/WarehouseMap";

const STATUS_COLORS: Record<string, string> = {
  idle: "#00a878",
  "to-pickup": "#2f6bff",
  "to-dropoff": "#7a4dff",
  waiting: "#ffcf00",
  detour: "#ff9f1c",
  "to-charge": "#00a878",
  charging: "#00a878",
  failed: "#ff4d2e",
};

const EVENT_COLORS: Record<string, string> = {
  task: "#2f6bff",
  conflict: "#ffcf00",
  reroute: "#ff9f1c",
  deadlock: "#ff4d2e",
  fail: "#ff4d2e",
  recover: "#00a878",
  charge: "#00a878",
  info: "#7a4dff",
};

function StatBox({
  label,
  value,
  icon: Icon,
  bg = "#ffffff",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  bg?: string;
}) {
  return (
    <div className="nb-border nb-shadow-sm flex items-center gap-3 p-3" style={{ background: bg }}>
      <div className="nb-border flex size-9 shrink-0 items-center justify-center bg-white">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate font-mono text-[10px] font-bold tracking-wider uppercase opacity-60">
          {label}
        </div>
        <div className="font-mono text-xl font-black leading-tight">{value}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const fleetRef = useRef<Fleet | null>(null);
  if (!fleetRef.current) {
    fleetRef.current = new Fleet();
    fleetRef.current.start("distributed", 4);
  }
  const fleet = fleetRef.current;

  const [agents, setAgents] = useState<AMRAgent[]>([]);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(6); // ticks per second
  const [mode, setMode] = useState<FleetMode>("distributed");
  const [fleetSize, setFleetSize] = useState(4);
  const [, forceRender] = useState(0);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const interval = 1000 / speed;
    timerRef.current = window.setInterval(() => {
      fleet.step();
      setAgents([...fleet.agents]);
      setTick(fleet.tick);
      forceRender((n) => n + 1);
    }, interval);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [running, speed, fleet]);

  const restart = (m: FleetMode, size: number) => {
    fleet.start(m, size);
    setMode(m);
    setFleetSize(size);
    setAgents([...fleet.agents]);
    setTick(0);
    forceRender((n) => n + 1);
  };

  const telemetry = fleet.telemetry();
  const stats = fleet.stats();
  const jobs = fleet.jobs.slice(-8).reverse();
  const events = [...fleet.events].reverse();

  const history = fleet.history.slice(-60);
  const throughputData = useMemo(
    () => history.map((h) => ({ tick: h.tick, tasks: h.throughput })),
    [history],
  );
  const congestionData = useMemo(
    () => history.map((h) => ({ tick: h.tick, congestion: h.congestion, waits: h.avgWait })),
    [history],
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b-4 border-foreground bg-primary">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="nb-border flex size-9 items-center justify-center bg-accent">
              <Bot className="size-5 text-foreground" />
            </div>
            <div>
              <div className="font-mono text-sm font-black tracking-tight text-primary-foreground">
                SWARMGRID OPS
              </div>
              <div className="font-mono text-[10px] font-bold tracking-wider text-primary-foreground/70 uppercase">
                Distributed AMR Fleet Control
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge className="nb-border font-mono font-bold" style={{ background: "#0a0a0a", color: "#d3f462" }}>
              <Radio className="size-3" />
              {mode === "distributed" ? "EDGE MESH" : "CENTRAL BASELINE"}
            </Badge>
            {user?.email && (
              <span className="hidden font-mono text-[11px] font-bold text-primary-foreground/80 sm:inline">
                {user.email}
              </span>
            )}
            <Button
              size="sm"
              className="nb-border nb-press-sm h-8 bg-white px-3 font-mono text-xs font-bold text-foreground hover:bg-accent"
              onClick={handleSignOut}
            >
              EXIT
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[1fr_380px]">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-4">
          {/* Controls */}
          <Card className="nb-border-4 nb-shadow bg-card">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <Button
                className="nb-border nb-press h-10 bg-accent px-4 font-mono font-black text-foreground hover:bg-accent/80"
                onClick={() => setRunning((r) => !r)}
              >
                {running ? <Pause className="size-4" /> : <Play className="size-4" />}
                {running ? "PAUSE" : "RUN"}
              </Button>
              <Button
                variant="outline"
                className="nb-border nb-press h-10 bg-white px-3 font-mono font-bold hover:bg-muted"
                onClick={() => restart(mode, fleetSize)}
              >
                <RotateCcw className="size-4" /> RESET
              </Button>
              <Button
                className="nb-border nb-press h-10 bg-secondary px-3 font-mono font-bold text-foreground hover:bg-secondary/80"
                onClick={() => {
                  fleet.injectJob();
                  forceRender((n) => n + 1);
                }}
              >
                <Plus className="size-4" /> JOB
              </Button>
              <Button
                className="nb-border nb-press h-10 bg-[#d3f462] px-3 font-mono font-bold text-foreground hover:bg-[#c4e64f]"
                onClick={() => {
                  fleet.injectBurst(5);
                  forceRender((n) => n + 1);
                }}
              >
                <Boxes className="size-4" /> BURST ×5
              </Button>
              <Button
                className="nb-border nb-press h-10 bg-[#ff4d2e] px-3 font-mono font-black text-white hover:bg-[#e63e20]"
                onClick={() => {
                  const live = fleet.agents.filter((a) => a.status !== "failed");
                  if (live.length > 1) {
                    const victim = live[Math.floor(Math.random() * live.length)];
                    fleet.failRobot(victim.id);
                    forceRender((n) => n + 1);
                  }
                }}
              >
                <Skull className="size-4" /> KILL ROBOT
              </Button>

              <div className="ml-auto flex items-center gap-2">
                <Tabs
                  value={mode}
                  onValueChange={(v) => restart(v as FleetMode, fleetSize)}
                >
                  <TabsList className="nb-border h-10 bg-white p-0">
                    <TabsTrigger
                      value="distributed"
                      className="nb-border-0 h-10 rounded-none px-3 font-mono text-xs font-bold data-[state=active]:bg-accent data-[state=active]:text-foreground"
                    >
                      DISTRIBUTED
                    </TabsTrigger>
                    <TabsTrigger
                      value="baseline"
                      className="nb-border-0 h-10 rounded-none px-3 font-mono text-xs font-bold data-[state=active]:bg-[#ffcf00] data-[state=active]:text-foreground"
                    >
                      BASELINE
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {/* Map + status */}
          <div className="grid gap-4 xl:grid-cols-[auto_260px]">
            <Card className="nb-border-4 nb-shadow bg-muted p-4">
              <WarehouseMap agents={agents} tick={tick} />
            </Card>

            <Card className="nb-border-4 nb-shadow bg-card">
              <CardHeader className="border-b-4 border-foreground py-3">
                <CardTitle className="font-mono text-sm font-black tracking-wide uppercase">
                  Fleet Status
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-3">
                {telemetry.length === 0 && (
                  <p className="font-mono text-xs text-muted-foreground">Booting agents…</p>
                )}
                {telemetry.map((t) => (
                  <div key={t.id} className="nb-border bg-white p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="nb-border inline-block size-3 shrink-0"
                        style={{ background: STATUS_COLORS[t.status] ?? "#d3f462" }}
                      />
                      <span className="font-mono text-xs font-black">{t.id.toUpperCase()}</span>
                      <span
                        className="ml-auto px-1 font-mono text-[9px] font-bold tracking-wider uppercase"
                        style={{
                          background: STATUS_COLORS[t.status] ?? "#d3f462",
                          color: t.status === "waiting" ? "#0a0a0a" : "#ffffff",
                        }}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-2 font-mono text-[10px] leading-4">
                      <span className="opacity-60">TASK</span>
                      <span className="text-right font-bold">{t.taskId ?? "—"}</span>
                      <span className="opacity-60">DEST</span>
                      <span className="text-right font-bold">{t.destination ?? "—"}</span>
                      <span className="opacity-60">ETA</span>
                      <span className="text-right font-bold">{t.eta !== null ? `T+${t.eta}` : "—"}</span>
                      <span className="opacity-60">AI RISK</span>
                      <span className="text-right font-bold">
                        {(t.edgeAI.p * 100).toFixed(0)}% {t.edgeAI.suggest}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <BatteryCharging className="size-3 shrink-0" />
                      <div className="nb-border h-3 flex-1 bg-white">
                        <div
                          className="h-full"
                          style={{
                            width: `${t.battery}%`,
                            background: t.battery > 40 ? "#00a878" : t.battery > 20 ? "#ffcf00" : "#ff4d2e",
                          }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono text-[10px] font-bold">
                        {t.battery.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase opacity-60">Fleet size</span>
                  <Input
                    type="number"
                    min={3}
                    max={6}
                    value={fleetSize}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 3 && n <= 6) restart(mode, n);
                    }}
                    className="nb-border h-7 w-16 bg-white px-2 font-mono text-xs font-bold"
                  />
                  <span className="ml-auto font-mono text-[10px] font-bold uppercase opacity-60">
                    Speed {speed}x
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-24 accent-foreground"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Metrics charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="nb-border-4 nb-shadow bg-card">
              <CardHeader className="border-b-4 border-foreground py-3">
                <CardTitle className="flex items-center gap-2 font-mono text-sm font-black tracking-wide uppercase">
                  <TrendingUp className="size-4" /> Throughput
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={throughputData}>
                      <CartesianGrid stroke="rgba(10,10,10,0.12)" />
                      <Area
                        type="stepAfter"
                        dataKey="tasks"
                        stroke="#0a0a0a"
                        strokeWidth={2}
                        fill="#2f6bff"
                        fillOpacity={0.85}
                      />
                      <ReTooltip
                        contentStyle={{
                          border: "2px solid #0a0a0a",
                          borderRadius: 0,
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="nb-border-4 nb-shadow bg-card">
              <CardHeader className="border-b-4 border-foreground py-3">
                <CardTitle className="flex items-center gap-2 font-mono text-sm font-black tracking-wide uppercase">
                  <Activity className="size-4" /> Congestion vs Waits
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={congestionData}>
                      <CartesianGrid stroke="rgba(10,10,10,0.12)" />
                      <XAxis dataKey="tick" hide />
                      <YAxis domain={[0, 1]} hide />
                      <Line type="stepAfter" dataKey="congestion" stroke="#7a4dff" strokeWidth={2} dot={false} />
                      <Line
                        type="stepAfter"
                        dataKey="waits"
                        stroke="#ff4d2e"
                        strokeWidth={2}
                        dot={false}
                        yAxisId={0}
                      />
                      <ReTooltip
                        contentStyle={{
                          border: "2px solid #0a0a0a",
                          borderRadius: 0,
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fleet stats grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatBox label="Delivered" value={stats.tasksCompleted} icon={Boxes} bg="#d3f462" />
            <StatBox label="Pending" value={stats.tasksPending} icon={Gauge} />
            <StatBox label="Reroutes" value={stats.reroutes} icon={GitBranch} bg="#ffd7be" />
            <StatBox label="Waits" value={stats.waits} icon={Pause} />
            <StatBox label="Yields" value={stats.deadlocksResolved} icon={Zap} bg="#ffd7be" />
            <StatBox
              label="Avg job"
              value={`${stats.avgTaskTime.toFixed(0)}t`}
              icon={BrainCircuit}
            />
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-4">
          <Card className="nb-border-4 nb-shadow bg-card">
            <CardHeader className="border-b-4 border-foreground py-3">
              <CardTitle className="flex items-center gap-2 font-mono text-sm font-black tracking-wide uppercase">
                <Radio className="size-4" /> Mesh Network
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 p-3 text-center">
              <div className="nb-border bg-white p-2">
                <div className="font-mono text-lg font-black">{stats.busSent}</div>
                <div className="font-mono text-[9px] font-bold tracking-wider uppercase opacity-60">
                  Msgs sent
                </div>
              </div>
              <div className="nb-border bg-white p-2">
                <div className="font-mono text-lg font-black text-[#ff4d2e]">{stats.busDroppedPct}%</div>
                <div className="font-mono text-[9px] font-bold tracking-wider uppercase opacity-60">
                  Packet loss
                </div>
              </div>
              <div className="nb-border bg-white p-2">
                <div className="font-mono text-lg font-black">{fleet.agents.filter((a) => a.status === "failed").length}</div>
                <div className="font-mono text-[9px] font-bold tracking-wider uppercase opacity-60">
                  Robots down
                </div>
              </div>
              <p className="col-span-3 mt-1 text-left font-mono text-[10px] leading-4 opacity-60">
                Robots coordinate peer-to-peer. Dashboard only observes telemetry — it never issues
                movement commands.
              </p>
            </CardContent>
          </Card>

          <Card className="nb-border-4 nb-shadow bg-card">
            <CardHeader className="border-b-4 border-foreground py-3">
              <CardTitle className="flex items-center gap-2 font-mono text-sm font-black tracking-wide uppercase">
                <Boxes className="size-4" /> Job Board
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <ScrollArea className="h-44">
                <div className="flex flex-col gap-1.5 pr-2">
                  {jobs.length === 0 && (
                    <p className="font-mono text-xs text-muted-foreground">No jobs yet.</p>
                  )}
                  {jobs.map((j) => (
                    <div key={j.id} className="nb-border flex items-center gap-2 bg-white px-2 py-1.5">
                      <span className="font-mono text-xs font-black">{j.id}</span>
                      <span className="font-mono text-[10px] opacity-60">
                        {j.bayId} → {j.stationId}
                      </span>
                      <span
                        className="ml-auto px-1 font-mono text-[9px] font-bold uppercase"
                        style={{
                          background: j.done ? "#00a878" : j.claimedBy ? "#2f6bff" : "#ffcf00",
                          color: "#ffffff",
                        }}
                      >
                        {j.done ? "done" : j.claimedBy ? j.claimedBy.replace("amr-", "AMR-") : "open"}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="nb-border-4 nb-shadow bg-card">
            <CardHeader className="border-b-4 border-foreground py-3">
              <CardTitle className="flex items-center gap-2 font-mono text-sm font-black tracking-wide uppercase">
                <Activity className="size-4" /> Event Log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <ScrollArea className="h-64">
                <div className="flex flex-col gap-1 pr-2">
                  {events.length === 0 && (
                    <p className="font-mono text-xs text-muted-foreground">Waiting for events…</p>
                  )}
                  {events.map((e, i) => (
                    <div key={`${e.tick}-${i}`} className="flex items-start gap-2 font-mono text-[10px] leading-4">
                      <span
                        className="mt-1 inline-block size-2 shrink-0"
                        style={{ background: EVENT_COLORS[e.kind] ?? "#0a0a0a" }}
                      />
                      <span className="opacity-50">T{e.tick}</span>
                      {e.robot && (
                        <span className="font-bold">{e.robot.replace("amr-", "AMR-")}</span>
                      )}
                      <span className="opacity-80">{e.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
