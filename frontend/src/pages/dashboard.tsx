import { useState, useEffect, useCallback } from "react";
import {
  Activity, Cpu, HardDrive, Server, Network, Clock,
  Zap, MemoryStick, Wifi, X, RefreshCw,
  TrendingUp, Globe, Terminal, Folder, Bot, Shield,
  ArrowUpRight, ArrowDownRight,
  Gauge, Disc, Radio, Database, Play, Save,
  Info, ChevronRight, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/contexts/language";
import { api } from "@/lib/api";

function RadialProgress({ value, size = 80, stroke = 8, color = "#8b5cf6" }: {
  value: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

function MetricCard({ title, value, percent, sub, icon: Icon, color = "#8b5cf6" }: {
  title: string; value: string; percent?: number; sub?: string; icon: any; color?: string;
}) {
  const isHigh = (percent || 0) > 85;
  const isMed = (percent || 0) > 65;
  const ringColor = isHigh ? "#ef4444" : isMed ? "#8b5cf6" : color;
  return (
    <div className="relative rounded-2xl border p-4 md:p-5 overflow-hidden flex flex-col gap-3 group hover:border-accent/30 transition-all duration-300 animate-fadeIn"
      style={{ background: "linear-gradient(135deg, #140a24 0%, #1a0e30 100%)", borderColor: "rgba(139,92,246,0.15)" }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 0%, ${color}10 0%, transparent 60%)` }} />
      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-[0.2em] truncate">{title}</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-white mt-1 tracking-tight">{value}</p>
          {sub && <p className="text-[10px] md:text-[11px] text-zinc-500 mt-0.5 truncate">{sub}</p>}
        </div>
        {percent !== undefined ? (
          <div className="relative flex items-center justify-center shrink-0">
            <RadialProgress value={percent} size={56} stroke={5} color={ringColor} />
            <span className="absolute text-[10px] font-bold" style={{ color: ringColor }}>{Math.round(percent)}%</span>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        )}
      </div>
      {percent !== undefined && (
        <div className="h-1.5 rounded-full overflow-hidden bg-white/5 relative z-10">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, percent)}%`, background: `linear-gradient(90deg, ${ringColor}60, ${ringColor})` }} />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${ringColor}30, transparent)` }} />
    </div>
  );
}

function QuickAction({ icon: Icon, label, color, onClick }: { icon: any; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border hover:scale-105 transition-all duration-200 cursor-pointer group animate-fadeIn"
      style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.1)" }}>
      <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
        <Icon className="w-[18px] h-[18px] md:w-5 md:h-5" style={{ color }} />
      </div>
      <span className="text-[10px] md:text-xs text-zinc-400 font-medium group-hover:text-white transition-colors">{label}</span>
    </button>
  );
}

function StatRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border p-3 md:p-3.5 flex items-center gap-3 hover:border-accent/30 transition-all duration-200 group animate-fadeIn"
      style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.1)" }}>
      <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-sm font-bold text-white font-mono truncate">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const { t } = useLang();
  const [now, setNow] = useState(new Date());
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [ports, setPorts] = useState<any[]>([]);
  const [portsLoading, setPortsLoading] = useState(true);
  const [processes, setProcesses] = useState<any[]>([]);
  const [processesLoading, setProcessesLoading] = useState(true);

  const [buildCmd, setBuildCmd] = useState("");
  const [runCmd, setRunCmd] = useState("");
  const [startupLoading, setStartupLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [savingStartup, setSavingStartup] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

  const fetchStats = useCallback(async () => {
    try { setStats(await api.getSystemStats()); } catch {} finally { setStatsLoading(false); }
  }, []);
  const fetchPorts = useCallback(async () => {
    try { setPorts(await api.getSystemPorts()); } catch {} finally { setPortsLoading(false); }
  }, []);
  const fetchProcesses = useCallback(async () => {
    try { setProcesses(await api.getSystemProcesses()); } catch {} finally { setProcessesLoading(false); }
  }, []);

  useEffect(() => {
    fetchStats(); fetchPorts(); fetchProcesses();
    const si = setInterval(fetchStats, 3000);
    const pi = setInterval(fetchPorts, 10000);
    const pri = setInterval(fetchProcesses, 5000);
    const ci = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(si); clearInterval(pi); clearInterval(pri); clearInterval(ci); };
  }, []);

  useEffect(() => {
    api.getStartupConfig()
      .then((cfg) => { setBuildCmd(cfg.build_cmd || ""); setRunCmd(cfg.run_cmd || ""); })
      .catch(() => {})
      .finally(() => setStartupLoading(false));
  }, []);

  const handleKill = async (pid: number) => {
    try {
      await api.killProcess(pid);
      toast({ title: "Process killed", description: `PID ${pid} terminated` });
      fetchProcesses();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to kill process", variant: "destructive" });
    }
  };

  const handleSaveStartup = async () => {
    setSavingStartup(true);
    try {
      await api.updateStartupConfig({ build_cmd: buildCmd, run_cmd: runCmd });
      toast({ title: "Startup saved", description: "Commands saved to database" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save", variant: "destructive" });
    } finally {
      setSavingStartup(false);
    }
  };

  const handleStartServer = async () => {
    if (!runCmd.trim()) {
      toast({ title: "No run command", description: "Set a run command first", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const result = await api.runStartup();
      if (result.build_output) {
        toast({ title: "Build output", description: result.build_output.slice(0, 200) });
      }
      toast({ title: "Server started", description: result.start_output.slice(0, 200) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start server", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="p-3 md:p-5 max-w-7xl mx-auto space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 md:gap-3 animate-fadeIn">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)", boxShadow: "0 0 20px rgba(139,92,246,0.3)" }}>
            <Activity className="w-[18px] h-[18px] md:w-5 md:h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">{t("system_overview")}</h1>
            <p className="text-zinc-500 text-xs md:text-sm">{t("live_monitoring")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {stats && (
            <div className="hidden sm:flex items-center gap-2 text-xs md:text-sm px-2 md:px-3 py-1.5 rounded-xl border" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <Globe className="w-3 h-3 text-zinc-500" />
              <span className="font-mono text-zinc-300 text-[10px] md:text-xs">{stats.hostname?.replace(/-hibernate.*$/, "") || "SERVER HUB"}</span>
            </div>
          )}
          <div className="text-[10px] md:text-xs font-mono text-zinc-600 tabular-nums bg-white/5 px-2 md:px-3 py-1.5 rounded-xl">{now.toLocaleTimeString()}</div>
          <Button variant="ghost" size="sm" onClick={fetchStats} className="h-7 w-7 md:h-8 md:w-8 p-0 text-zinc-500 hover:text-white">
            <RefreshCw className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </Button>
        </div>
      </div>

      {/* Info Bar */}
      {showInfo && (
        <div className="relative rounded-2xl border overflow-hidden animate-fadeIn" style={{ background: "linear-gradient(135deg, #1a0e30 0%, #140a24 100%)", borderColor: "rgba(139,92,246,0.15)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 0% 50%, rgba(139,92,246,0.08), transparent 60%)" }} />
          <button onClick={() => setShowInfo(false)} className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition-colors text-xs">&times;</button>
          <div className="relative px-4 py-3 md:py-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-zinc-300">Getting Started</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { num: "1", title: "Upload Files", desc: "Upload your project files with libraries (requirements.txt, package.json)" },
                { num: "2", title: "Startup Config", desc: "Set build and run commands below, then save" },
                { num: "3", title: "Start Server", desc: "Hit Start Server to build and run your project" },
              ].map((step) => (
                <div key={step.num} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}>{step.num}</div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">{step.title}</p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2 md:gap-3 animate-fadeIn">
        <QuickAction icon={Terminal} label={t("terminal")} color="#8b5cf6" onClick={() => window.location.hash = "#/terminal"} />
        <QuickAction icon={Folder} label={t("files")} color="#a855f7" onClick={() => window.location.hash = "#/files"} />
        <QuickAction icon={Bot} label={t("ai_chat")} color="#6d28d9" onClick={() => window.location.hash = "#/ai"} />
        <QuickAction icon={Globe} label={t("domains") || "Domains"} color="#7c3aed" onClick={() => window.location.hash = "#/domains"} />
      </div>

      {/* Startup Section */}
      {!startupLoading && (
        <div className="rounded-2xl border animate-fadeIn" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-accent" />
              <span className="font-semibold text-sm">Startup</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleStartServer} disabled={starting || !runCmd.trim()}
                className="h-7 px-3 text-xs font-bold text-green-400 hover:bg-green-500/10">
                {starting ? <span className="animate-pulse">Starting...</span> : "Start Server"}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSaveStartup} disabled={savingStartup}
                className="h-7 px-3 text-xs font-bold text-accent hover:bg-accent/10">
                <Save className="w-3 h-3 mr-1" /> Save
              </Button>
            </div>
          </div>
          <div className="p-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-mono text-zinc-500 mb-1 block">Build Command</label>
              <input value={buildCmd} onChange={(e) => setBuildCmd(e.target.value)}
                placeholder="npm install && npm run build (optional)"
                className="w-full h-9 px-3 text-xs font-mono rounded-xl border outline-none transition-colors"
                style={{ background: "#1d1033", borderColor: "rgba(139,92,246,0.15)", color: "#e4e4e7" }}
                onFocus={(e) => e.target.style.borderColor = "rgba(139,92,246,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(139,92,246,0.15)"} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-mono text-zinc-500 mb-1 block">Start Command</label>
              <input value={runCmd} onChange={(e) => setRunCmd(e.target.value)}
                placeholder="node index.js  /  python3 main.py  /  php index.php"
                className="w-full h-9 px-3 text-xs font-mono rounded-xl border outline-none transition-colors"
                style={{ background: "#1d1033", borderColor: "rgba(139,92,246,0.15)", color: "#e4e4e7" }}
                onFocus={(e) => e.target.style.borderColor = "rgba(139,92,246,0.4)"}
                onBlur={(e) => e.target.style.borderColor = "rgba(139,92,246,0.15)"} />
            </div>
          </div>
        </div>
      )}

      {/* Main Metrics */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 md:h-36 rounded-2xl animate-pulse" style={{ background: "#140a24" }} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard title={t("cpu_usage")} value={`${stats.cpu_percent?.toFixed(1) || "0"}%`} percent={stats.cpu_percent}
            sub={`${stats.cpu_count} ${t("cores")} · ${t("load")}: ${stats.load_avg?.toFixed(2) ?? "N/A"}`} icon={Cpu} color="#8b5cf6" />
          <MetricCard title={t("memory")} value={stats.mem_used} percent={stats.mem_percent}
            sub={`${t("of")} ${stats.mem_total}${stats.mem_available ? ` · ${stats.mem_available} free` : ""}`} icon={MemoryStick} color="#a855f7" />
          <MetricCard title={t("disk_space")} value={stats.disk_used} percent={stats.disk_percent}
            sub={`${t("of")} ${stats.disk_total}${stats.disk_free ? ` · ${stats.disk_free} free` : ""}`} icon={HardDrive} color="#6d28d9" />
          <MetricCard title={t("uptime")} value={stats.uptime}
            sub={now.toLocaleDateString()} icon={Clock} color="#7c3aed" />
        </div>
      ) : null}

      {/* Secondary Stats */}
      {stats && (stats.net_sent || stats.net_recv || stats.cpu_freq) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {stats.net_sent && (
            <StatRow icon={ArrowUpRight} label="Sent" value={stats.net_sent} color="#22c55e" />
          )}
          {stats.net_recv && (
            <StatRow icon={ArrowDownRight} label="Received" value={stats.net_recv} color="#3b82f6" />
          )}
          {stats.cpu_freq && (
            <StatRow icon={Zap} label="CPU Freq" value={stats.cpu_freq} color="#a855f7" />
          )}
          {stats.processes !== undefined && (
            <StatRow icon={Server} label="Processes" value={String(stats.processes)} color="#7c3aed" />
          )}
        </div>
      )}

      {/* Ports & Processes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {/* Open Ports */}
        <div className="rounded-2xl border flex flex-col animate-fadeIn" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)", minHeight: 320, maxHeight: 420 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.1)" }}>
                <Radio className="w-3.5 h-3.5 text-accent" />
              </div>
              <span className="font-semibold text-sm">{t("open_ports")}</span>
            </div>
            <Badge className="text-[10px] bg-accent/10 text-accent border-accent/20 font-mono">{ports?.length ?? 0}</Badge>
          </div>
          <div className="flex-1 overflow-auto scrollbar-none">
            {portsLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 w-full rounded-lg animate-pulse" style={{ background: "#1d1033" }} />)}</div>
            ) : ports && ports.length > 0 ? (
              <div className="divide-y divide-white/5">
                {ports.map((port, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/3 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="px-2 py-0.5 rounded text-xs font-mono font-bold border shrink-0" style={{ background: "rgba(139,92,246,0.15)", borderColor: "rgba(139,92,246,0.3)", color: "#a855f7" }}>
                        :{port.port}
                      </div>
                      <div className="min-w-0 truncate">
                        <span className="text-sm font-medium text-white truncate">{port.process || "unknown"}</span>
                        {port.pid && <span className="text-[10px] text-zinc-600 font-mono ml-2">PID:{port.pid}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono shrink-0 hidden sm:block">{port.addr}</span>
                    <span className="text-[10px] text-zinc-600 font-mono shrink-0 sm:hidden">{port.addr?.split(":")[0] || port.addr}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                <Wifi className="w-10 h-10 opacity-20" /><p className="text-sm">{t("no_ports")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Processes */}
        <div className="rounded-2xl border flex flex-col animate-fadeIn" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)", minHeight: 320, maxHeight: 420 }}>
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.1)" }}>
                <Database className="w-3.5 h-3.5 text-accent" />
              </div>
              <span className="font-semibold text-sm">{t("top_processes")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="text-[10px] bg-white/5 text-zinc-400 border-white/10 font-mono">{processes?.length ?? 0}</Badge>
              <Button variant="ghost" size="sm" onClick={fetchProcesses} className="h-6 w-6 p-0 text-zinc-600 hover:text-white">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto scrollbar-none">
            {processesLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 w-full rounded-lg animate-pulse" style={{ background: "#1d1033" }} />)}</div>
            ) : processes && processes.length > 0 ? (
              <div className="divide-y divide-white/5">
                {processes.slice(0, 40).map((proc) => (
                  <div key={proc.pid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{proc.name}</span>
                        <span className="text-[10px] text-zinc-600 font-mono shrink-0">#{proc.pid}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-12 md:w-16 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, proc.cpu)}%`, background: proc.cpu > 50 ? "#ef4444" : "#8b5cf6" }} />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono w-10">{proc.cpu?.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-12 md:w-16 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, proc.memory)}%`, background: "#a855f7" }} />
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono w-10">{proc.memory?.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleKill(proc.pid)}
                      className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <X className="w-3 h-3 mr-1" /> {t("kill")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                <Server className="w-10 h-10 opacity-20" /><p className="text-sm">{t("no_processes")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
