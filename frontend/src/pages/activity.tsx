import { useState, useEffect, useCallback } from "react";
import {
  Activity, Search, Filter, Trash2, RefreshCw, Clock,
  User, Shield, CheckCircle, XCircle, Info, ChevronDown,
  BarChart3, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/contexts/language";
import { api, BASE } from "@/lib/api";

interface ActivityEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  target: string;
  details: string;
  ip: string;
  status: "success" | "failed" | "info";
}

interface ActivityStats {
  total: number;
  today: number;
  thisWeek: number;
  topActions: { action: string; count: number }[];
  topUsers: { user: string; count: number }[];
  byStatus: { success: number; failed: number; info: number };
}

const ACTION_COLORS: Record<string, string> = {
  login: "bg-green-500/10 text-green-400 border-green-500/20",
  logout: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  create: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  delete: "bg-red-500/10 text-red-400 border-red-500/20",
  update: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  upload: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  download: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <div className="rounded-xl border p-4 flex items-center gap-3" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</p>
        <p className="text-lg font-bold text-white font-mono">{value}</p>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const { toast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (filterAction) params.set("action", filterAction);
      if (filterStatus) params.set("status", filterStatus);
      params.set("limit", "200");

      const token = localStorage.getItem("sh_token");
      const res = await fetch(`/api/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.items || []);
    } catch {} finally { setLoading(false); }
  }, [search, filterAction, filterStatus]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem("sh_token");
      const res = await fetch(`${BASE}/api/activity/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchLogs(); fetchStats(); }, [fetchLogs, fetchStats]);

  const handleClear = async () => {
    try {
      const token = localStorage.getItem("sh_token");
      await fetch(`${BASE}/api/activity`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setEntries([]);
      fetchStats();
      toast({ title: "Activity log cleared" });
    } catch { toast({ title: "Failed to clear", variant: "destructive" }); }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)", boxShadow: "0 0 20px rgba(139,92,246,0.3)" }}>
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("activity_log")}</h1>
            <p className="text-zinc-500 text-sm">{t("track_all_actions")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchLogs} className="h-8 w-8 p-0 text-zinc-500 hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.total} icon={BarChart3} color="#8b5cf6" />
          <StatCard label="Today" value={stats.today} icon={Clock} color="#22c55e" />
          <StatCard label="This Week" value={stats.thisWeek} icon={TrendingUp} color="#3b82f6" />
          <StatCard label="Failed" value={stats.byStatus.failed} icon={XCircle} color="#ef4444" />
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activity..."
            className="w-full h-10 pl-10 pr-4 rounded-xl text-white text-sm bg-[#140a24] border border-[rgba(139,92,246,0.3)] focus:outline-none focus:border-accent transition-colors" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)}
          className={`h-10 px-3 text-xs ${showFilters ? "text-accent bg-accent/10" : "text-zinc-500"}`}>
          <Filter className="w-4 h-4 mr-1" /> Filters
        </Button>
      </div>

      {showFilters && (
        <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Action:</span>
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
              className="h-8 px-2 rounded-lg text-xs text-white bg-white/5 border border-white/10 focus:outline-none">
              <option value="">All</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="create">Create</option>
              <option value="delete">Delete</option>
              <option value="update">Update</option>
              <option value="upload">Upload</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Status:</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 px-2 rounded-lg text-xs text-white bg-white/5 border border-white/10 focus:outline-none">
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: "#1d1033" }} />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-600">
            <Activity className="w-12 h-12 opacity-20" />
            <p className="text-sm">No activity found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition-colors">
                <div className="shrink-0">{getStatusIcon(entry.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] font-mono ${ACTION_COLORS[entry.action] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                      {entry.action}
                    </Badge>
                    <span className="text-sm text-white font-medium truncate">{entry.target}</span>
                    {entry.details && <span className="text-xs text-zinc-500 truncate">— {entry.details}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-zinc-600 font-mono flex items-center gap-1">
                      <User className="w-3 h-3" /> {entry.user}
                    </span>
                    <span className="text-[10px] text-zinc-600 font-mono">{entry.ip}</span>
                    <span className="text-[10px] text-zinc-600">{formatTime(entry.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
