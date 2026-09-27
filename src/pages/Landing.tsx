import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Boxes,
  GitBranch,
  Network,
  Radar,
  Route,
  ShieldAlert,
  Radio,
  Container,
  Cpu,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

const FEATURES = [
  {
    icon: Route,
    title: "A* + Reservation Table",
    body: "Each robot plans its own space-time path and books cells ahead of time. Conflicts are resolved before they happen.",
    bg: "#2f6bff",
    fg: "#ffffff",
  },
  {
    icon: BrainCircuit,
    title: "On-Edge AI Inference",
    body: "A tiny logistic model runs on every AMR predicting congestion from neighbour density and crossing traffic — reroute before the jam.",
    bg: "#d3f462",
    fg: "#0a0a0a",
  },
  {
    icon: GitBranch,
    title: "Dynamic Re-Routing",
    body: "Blocked? The robot re-plans around the obstacle in-flight. Deadlocks are broken with priority yielding and step-aside moves.",
    bg: "#ffd7be",
    fg: "#0a0a0a",
  },
  {
    icon: ShieldAlert,
    title: "Failure Recovery",
    body: "Kill any robot mid-mission. Peers hear the fail-alert over the mesh and re-auction its task in seconds. No central brain required.",
    bg: "#ff4d2e",
    fg: "#ffffff",
  },
  {
    icon: Network,
    title: "Peer-to-Peer Mesh",
    body: "State, intents and plans are broadcast over a lossy Wi-Fi bus with real packet drop and latency. The dashboard just watches.",
    bg: "#7a4dff",
    fg: "#ffffff",
  },
  {
    icon: Boxes,
    title: "Live Benchmark",
    body: "Toggle between the distributed mesh and a stop-and-wait central baseline. Watch throughput, waits and reroutes diverge in real time.",
    bg: "#0a0a0a",
    fg: "#ffffff",
  },
];

const ARCH = [
  { n: "01", title: "PERCEIVE", body: "Broadcast position, battery, task + planned path to the mesh" },
  { n: "02", title: "PREDICT", body: "Edge-AI model scores congestion risk from local view" },
  { n: "03", title: "PLAN", body: "A* over the warehouse grid + time-aware reservations" },
  { n: "04", title: "NEGOTIATE", body: "Priority rules + yield protocol break deadlocks locally" },
  { n: "05", title: "ACT", body: "Move, wait, re-route or step aside — all decided on-robot" },
];

function Marquee() {
  const items = [
    "NO CLOUD BRAIN",
    "EDGE MESH",
    "COLLISION-FREE",
    "DEADLOCK-PROOF",
    "SELF-HEALING",
    "3+ AMRs",
    "REAL-TIME",
  ];
  return (
    <div className="overflow-hidden border-y-4 border-foreground bg-foreground py-2.5">
      <div
        className="flex w-max gap-8 whitespace-nowrap"
        style={{ animation: "nb-marquee 22s linear infinite" }}
      >
        {[...items, ...items].map((t, i) => (
          <span key={i} className="flex items-center gap-8 font-mono text-xs font-black tracking-widest text-background">
            {t}
            <span className="text-[#d3f462]">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-background"
    >
      {/* NAV */}
      <header className="border-b-4 border-foreground bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <div className="nb-border-4 flex size-10 items-center justify-center bg-primary nb-shadow-sm">
            <Bot className="size-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-mono text-base leading-none font-black tracking-tight">
              SWARMGRID
            </div>
            <div className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">
              Edge Fleet Coordination
            </div>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            {!isLoading && isAuthenticated ? (
              <Button
                className="nb-border nb-press h-10 bg-accent px-4 font-mono text-sm font-black text-foreground hover:bg-accent/80"
                onClick={() => navigate("/dashboard")}
              >
                OPEN OPS <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                className="nb-border nb-press h-10 bg-primary px-4 font-mono text-sm font-black text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate("/auth?returnTo=%2Fdashboard")}
              >
                LAUNCH CONSOLE <ArrowRight className="size-4" />
              </Button>
            )}
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="nb-grid border-b-4 border-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            <Badge className="nb-border mb-5 bg-accent px-3 py-1 font-mono text-[11px] font-black tracking-wider text-foreground uppercase">
              Smart India Hackathon · Edge-AI · AMR Fleet
            </Badge>
            <h1 className="font-mono text-4xl leading-[1.05] font-black tracking-tight sm:text-5xl lg:text-6xl">
              THE WAREHOUSE
              <br />
              RUNS ITSELF.
              <br />
              <span className="mt-2 inline-block nb-border-4 bg-foreground px-2 py-1 text-[#d3f462]">
                NO CLOUD BRAIN.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 font-medium opacity-80">
              SwarmGrid is a distributed coordination framework for autonomous mobile robots.
              Every AMR carries its own brain — planner, conflict detector, congestion-predicting
              edge model — and talks to its peers over a lossy mesh. The dashboard? Just a window.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                className="nb-border nb-press nb-shadow h-12 bg-primary px-6 font-mono text-base font-black text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate("/auth?returnTo=%2Fdashboard")}
              >
                RUN THE SIMULATION <ArrowRight className="size-5" />
              </Button>
              <Button
                variant="outline"
                className="nb-border nb-press h-12 bg-white px-6 font-mono text-base font-bold hover:bg-muted"
                onClick={() =>
                  document.getElementById("architecture")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                HOW IT WORKS
              </Button>
            </div>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
              {[
                { v: "3–6", l: "autonomous AMRs" },
                { v: "0", l: "central decisions" },
                { v: "P2P", l: "robot mesh" },
              ].map((s) => (
                <div key={s.l} className="nb-border nb-shadow-sm bg-card p-3">
                  <div className="font-mono text-2xl font-black">{s.v}</div>
                  <div className="font-mono text-[9px] font-bold tracking-wider uppercase opacity-60">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero visual: mini live map mock */}
          <div className="flex items-center justify-center">
            <Card className="nb-border-4 nb-shadow-lg w-full max-w-md bg-muted p-4">
              <div className="nb-border-4 mb-3 flex items-center gap-2 bg-foreground px-3 py-2">
                <span className="size-2.5 bg-[#ff4d2e]" />
                <span className="size-2.5 bg-[#ffcf00]" />
                <span className="size-2.5 bg-[#00a878]" />
                <span className="ml-2 font-mono text-[10px] font-bold tracking-wider text-background uppercase">
                  swarmgrid://fleet-01 — live mesh
                </span>
              </div>
              <div className="grid grid-cols-12 gap-1">
                {Array.from({ length: 12 * 7 }).map((_, i) => {
                  const r = Math.floor(i / 12);
                  const c = i % 12;
                  const isRack = (c >= 1 && c <= 3 && r >= 1 && r <= 2) || (c >= 6 && c <= 8 && r >= 1 && r <= 2) || (c >= 1 && c <= 3 && r >= 4 && r <= 5) || (c >= 6 && c <= 8 && r >= 4 && r <= 5);
                  const isRobot = (r === 3 && c === 4) || (r === 3 && c === 9) || (r === 0 && c === 11);
                  const isStation = (r === 6 && c === 0) || (r === 6 && c === 5) || (r === 6 && c === 11);
                  return (
                    <div
                      key={i}
                      className="nb-border aspect-square"
                      style={{
                        background: isRack ? "#0a0a0a" : isRobot ? "#2f6bff" : isStation ? "#d3f462" : "#ffffff",
                        borderColor: "rgba(10,10,10,0.25)",
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between font-mono text-[10px] font-bold">
                <span className="nb-border bg-white px-2 py-0.5">AMR-01 → ST-C</span>
                <span className="nb-border bg-[#d3f462] px-2 py-0.5">2 conflicts resolved</span>
                <span className="nb-border bg-white px-2 py-0.5">T+128</span>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <Marquee />

      {/* FEATURES */}
      <section className="border-b-4 border-foreground bg-background">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <h2 className="font-mono text-3xl font-black tracking-tight sm:text-4xl">
            EVERY ROBOT IS
            <span className="nb-border-4 ml-2 inline-block bg-accent px-2">THE BRAIN.</span>
          </h2>
          <p className="mt-3 max-w-2xl font-medium opacity-70">
            Six systems, replicated on each agent. Nothing routes through a server.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="nb-border-4 nb-shadow nb-press bg-white p-0 transition-transform hover:-translate-y-1"
              >
                <div
                  className="nb-border-4 border-t-0 border-r-0 border-l-0 flex items-center gap-3 p-4"
                  style={{ background: f.bg, color: f.fg }}
                >
                  <div className="nb-border flex size-9 items-center justify-center bg-white/90">
                    <f.icon className="size-5" style={{ color: "#0a0a0a" }} />
                  </div>
                  <h3 className="font-mono text-sm font-black tracking-wide uppercase">{f.title}</h3>
                </div>
                <p className="p-4 text-sm leading-6 font-medium">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="border-b-4 border-foreground bg-foreground">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-mono text-3xl font-black tracking-tight text-background sm:text-4xl">
                AGENT LOOP
              </h2>
              <p className="mt-2 max-w-xl font-medium text-background/70">
                Runs independently on every AMR — the exact loop that ships to a Raspberry Pi or
                Jetson Nano.
              </p>
            </div>
            <div className="nb-border-4 flex items-center gap-2 bg-white px-3 py-2 font-mono text-[11px] font-bold">
              <Cpu className="size-4" /> 1 process = 1 robot
              <Container className="ml-2 size-4" /> docker run amr-01
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-5">
            {ARCH.map((a, i) => (
              <div key={a.n} className="relative">
                <div className="nb-border-4 nb-shadow h-full bg-card p-4">
                  <div className="font-mono text-3xl font-black text-[#2f6bff]">{a.n}</div>
                  <div className="mt-2 font-mono text-sm font-black tracking-wide">{a.title}</div>
                  <p className="mt-2 text-xs leading-5 font-medium opacity-70">{a.body}</p>
                </div>
                {i < ARCH.length - 1 && (
                  <ArrowRight className="absolute top-1/2 -right-3.5 z-10 hidden size-5 -translate-y-1/2 text-[#d3f462] md:block" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Radio,
                t: "Per-robot edge node",
                b: "Each AMR is an isolated process with its own planner, reservations and AI model — deployable to Pi/Jetson unchanged.",
              },
              {
                icon: Network,
                t: "Lossy mesh bus",
                b: "Peer messages face real packet loss and latency, so coordination survives Wi-Fi dead zones.",
              },
              {
                icon: Radar,
                t: "Judge-ready metrics",
                b: "Throughput, conflicts, reroutes, deadlocks and packet loss — measured live against the stop-and-wait baseline.",
              },
            ].map((x) => (
              <div key={x.t} className="nb-border-4 bg-background p-4">
                <x.icon className="size-5" />
                <div className="mt-2 font-mono text-sm font-black tracking-wide">{x.t}</div>
                <p className="mt-1.5 text-xs leading-5 font-medium text-background/70">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STACK STRIP */}
      <section className="border-b-4 border-foreground bg-secondary">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 py-8">
          {["TypeScript", "React", "Canvas", "Recharts", "A* Search", "Reservation Table", "Logistic Edge-AI", "P2P Mesh"].map(
            (t) => (
              <span
                key={t}
                className="nb-border nb-shadow-sm bg-white px-4 py-2 font-mono text-xs font-black tracking-wide"
              >
                {t}
              </span>
            ),
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="nb-grid bg-background">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center">
          <h2 className="font-mono text-3xl font-black tracking-tight sm:text-5xl">
            READY TO WATCH
            <br />
            <span className="mt-2 inline-block nb-border-4 bg-primary px-3 py-1 text-primary-foreground">
              ROBOTS THINK?
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg font-medium opacity-70">
            Launch the ops console, inject a job burst, kill a robot mid-mission — and watch the
            fleet heal itself without a single central command.
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              className="nb-border nb-press nb-shadow-lg h-14 bg-accent px-8 font-mono text-lg font-black text-foreground hover:bg-accent/80"
              onClick={() => navigate(isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard")}
            >
              LAUNCH OPS CONSOLE <ArrowRight className="size-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t-4 border-foreground bg-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6">
          <div className="flex items-center gap-2">
            <div className="nb-border flex size-7 items-center justify-center bg-[#d3f462]">
              <Bot className="size-4" />
            </div>
            <span className="font-mono text-xs font-black text-background">SWARMGRID</span>
          </div>
          <span className="font-mono text-[10px] font-bold tracking-wider text-background/60 uppercase">
            Edge-AI Distributed Fleet Coordination · SIH Project
          </span>
          <Link
            to="/auth?returnTo=%2Fdashboard"
            className="font-mono text-xs font-black text-[#d3f462] underline hover:text-[#d3f462]/80"
          >
            Sign in
          </Link>
        </div>
      </footer>
    </motion.div>
  );
}
