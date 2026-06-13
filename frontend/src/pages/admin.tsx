import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/language";
import { api, authFetch, BASE } from "@/lib/api";
import {
  Users, Plus, Search, Edit2, Trash2, Check, X,
  Shield, User, Clock, Ban, RefreshCw, Crown,
  Activity, Server, Cpu, HardDrive, Globe, Wifi,
  Zap, BarChart3, Eye, Settings, Lock,
  ShieldCheck, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface UserData {
  id: string;
  username: string;
  role: "admin" | "user";
  display_name: string;
  avatar: string | null;
  created_at: string;
  expires_at: string | null;
  disabled: boolean;
  last_login: string | null;
}

export default function AdminPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", password: "", display_name: "", role: "user", expires_days: "", disabled: false });
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "system">("overview");
  const [systemStats, setSystemStats] = useState<any>(null);
  const [dockerStatus, setDockerStatus] = useState<{ available: boolean; containers: string[] } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.getUsers()); } catch {} finally { setLoading(false); }
  }, []);

  const fetchStats = useCallback(async () => {
    try { setSystemStats(await api.getSystemStats()); } catch {}
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchStats();
    fetch(`${BASE}/api/docker/status`).then((r) => r.json()).then(setDockerStatus).catch(() => {});
    const i = setInterval(fetchStats, 5000);
    return () => clearInterval(i);
  }, []);

  const createUser = async () => {
    if (!form.username || !form.password) { toast({ title: t("error"), description: "Username and password required", variant: "destructive" }); return; }
    try {
      await api.createUser({ username: form.username, password: form.password, display_name: form.display_name || form.username, role: form.role, expires_days: form.expires_days ? parseInt(form.expires_days) : undefined });
      toast({ title: t("success"), description: `User ${form.username} created` });
      setShowCreate(false);
      setForm({ username: "", password: "", display_name: "", role: "user", expires_days: "", disabled: false });
      fetchUsers();
    } catch (err: any) { toast({ title: t("error"), description: err.message, variant: "destructive" }); }
  };

  const updateUser = async () => {
    if (!editUser) return;
    try {
      await api.updateUser(editUser.id, { display_name: form.display_name, role: form.role, disabled: form.disabled, ...(form.password ? { password: form.password } : {}), ...(form.expires_days !== "" ? { expires_days: form.expires_days === "0" ? null : parseInt(form.expires_days) } : {}) });
      toast({ title: t("success"), description: "User updated" });
      setEditUser(null);
      fetchUsers();
    } catch { toast({ title: t("error"), description: "Update failed", variant: "destructive" }); }
  };

  const deleteUser = async (id: string) => {
    try {
      await api.deleteUser(id);
      toast({ title: t("success"), description: "User deleted" });
      setDeleteConfirm(null);
      fetchUsers();
    } catch { toast({ title: t("error"), description: "Delete failed", variant: "destructive" }); }
  };

  const toggleDisable = async (u: UserData) => {
    try {
      await api.updateUser(u.id, { disabled: !u.disabled });
      fetchUsers();
    } catch {}
  };

  const filtered = users.filter((u) => u.username.toLowerCase().includes(search.toLowerCase()) || u.display_name.toLowerCase().includes(search.toLowerCase()));
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : t("never");
  const getDaysLeft = (expires_at: string | null) => {
    if (!expires_at) return null;
    const diff = new Date(expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };
  const openEdit = (u: UserData) => { setEditUser(u); setForm({ username: u.username, password: "", display_name: u.display_name, role: u.role, expires_days: "", disabled: u.disabled }); };

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => !u.disabled).length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const disabledCount = users.filter((u) => u.disabled).length;

  const statCards = [
    { label: "Total Users", value: totalUsers, icon: Users, color: "#8b5cf6" },
    { label: "Active Users", value: activeUsers, icon: Check, color: "#22c55e" },
    { label: "Admins", value: adminCount, icon: Crown, color: "#f59e0b" },
    { label: "Disabled", value: disabledCount, icon: Ban, color: "#ef4444" },
    ...(dockerStatus ? [{
      label: "Docker Isolation",
      value: dockerStatus.available ? "Active" : "Off",
      icon: dockerStatus.available ? ShieldCheck : ShieldAlert,
      color: dockerStatus.available ? "#22c55e" : "#ef4444",
    }] : []),
  ];

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2 md:gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)", boxShadow: "0 0 20px rgba(139,92,246,0.3)" }}>
            <Shield className="w-[18px] h-[18px] md:w-5 md:h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold">{t("admin_panel")}</h1>
            <p className="text-zinc-400 text-xs md:text-sm">{t("user_management")} & System Control</p>
          </div>
        </div>
        <div className="flex gap-1 md:gap-2">
          <Button variant="ghost" size="sm" onClick={() => { fetchUsers(); fetchStats(); }} className="text-zinc-400 hover:text-white h-8 w-8 p-0"><RefreshCw className="w-3.5 h-3.5" /></Button>
          {activeTab === "users" && (
            <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-white gap-1 md:gap-2 h-8 px-2 md:px-3 text-xs md:text-sm"><Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> {t("create_user")}</Button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl border overflow-x-auto" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
        {([["overview", "Overview", BarChart3], ["users", "Users", Users], ["system", "System", Server]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap ${
              activeTab === key ? "bg-primary/20 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            }`}>
            <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="hidden xs:inline">{label}</span>
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4 md:space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
            {statCards.map((s) => (
              <div key={s.label} className="rounded-xl border p-3 md:p-4 relative overflow-hidden" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider">{s.label}</p>
                    <p className="text-2xl md:text-3xl font-bold text-white mt-1">{s.value}</p>
                  </div>
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15` }}>
                    <s.icon className="w-[18px] h-[18px] md:w-5 md:h-5" style={{ color: s.color }} />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${s.color}40, transparent)` }} />
              </div>
            ))}
          </div>

          {/* System Info */}
          {systemStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div className="rounded-xl border p-4 md:p-5" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
                <div className="flex items-center gap-2 mb-3 md:mb-4"><Server className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent" /><span className="font-semibold text-xs md:text-sm">Server Info</span></div>
                <div className="space-y-2 md:space-y-3">
                  {[
                    ["Hostname", systemStats.hostname, Globe],
                    ["IP Address", systemStats.ip, Wifi],
                    ["OS", systemStats.os || "Unknown", Server],
                    ["Uptime", systemStats.uptime, Clock],
                    ["Processes", systemStats.processes, Activity],
                  ].map(([label, value, Icon]) => (
                    <div key={String(label)} className="flex items-center justify-between py-1 md:py-1.5 border-b" style={{ borderColor: "rgba(139,92,246,0.08)" }}>
                      <span className="text-zinc-500 text-[10px] md:text-xs flex items-center gap-1.5 md:gap-2"><Icon className="w-3 h-3 md:w-3.5 md:h-3.5" />{String(label)}</span>
                      <span className="text-white text-[10px] md:text-xs font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border p-4 md:p-5" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
                <div className="flex items-center gap-2 mb-3 md:mb-4"><Activity className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent" /><span className="font-semibold text-xs md:text-sm">Resource Usage</span></div>
                <div className="space-y-3 md:space-y-4">
                  {[
                    ["CPU", systemStats.cpu_percent, "#8b5cf6"],
                    ["Memory", systemStats.mem_percent, "#a855f7"],
                    ["Disk", systemStats.disk_percent, "#6d28d9"],
                  ].map(([label, percent, color]) => (
                    <div key={String(label)}>
                      <div className="flex items-center justify-between mb-1 md:mb-1.5">
                        <span className="text-zinc-400 text-[10px] md:text-xs">{String(label)}</span>
                        <span className="text-white text-[10px] md:text-xs font-mono">{Number(percent)?.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 md:h-2 rounded-full overflow-hidden bg-white/5">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, Number(percent) || 0)}%`, background: `linear-gradient(90deg, ${String(color)}80, ${String(color)})` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Users */}
          <div className="rounded-xl border" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
              <span className="font-semibold text-sm">Recent Users</span>
              <button onClick={() => setActiveTab("users")} className="text-xs text-accent hover:underline">View All</button>
            </div>
            <div className="divide-y divide-white/5">
              {users.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/3 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
                      {u.display_name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{u.display_name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">@{u.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={`text-[10px] ${u.role === "admin" ? "bg-accent/20 text-accent border-accent/30" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                      {u.role}
                    </Badge>
                    <span className="text-[10px] text-zinc-600">{formatDate(u.last_login)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <>
          <div className="relative max-w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_users")} className="pl-10 bg-[#140a24] border-[rgba(139,92,246,0.3)] text-white w-full" />
          </div>

          {/* Mobile: Card View */}
          <div className="md:hidden space-y-2">
            {loading ? (
              <div className="text-center py-12 text-zinc-500">{t("loading")}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">{t("no_results")}</div>
            ) : filtered.map((u) => {
              const daysLeft = getDaysLeft(u.expires_at);
              return (
                <div key={u.id} className="rounded-xl border p-3 space-y-2" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
                        {u.display_name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{u.display_name}</p>
                        <p className="text-[10px] font-mono text-zinc-500">@{u.username}</p>
                      </div>
                    </div>
                    <Badge className={u.role === "admin" ? "bg-accent/20 text-accent border-accent/30" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}>
                      {u.role === "admin" ? <Crown className="w-3 h-3 mr-1 inline" /> : <User className="w-3 h-3 mr-1 inline" />}{u.role}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge className={u.disabled ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}>
                        {u.disabled ? <Ban className="w-3 h-3 mr-1 inline" /> : <Check className="w-3 h-3 mr-1 inline" />}
                        {u.disabled ? t("disabled") : t("active")}
                      </Badge>
                      <span className="text-zinc-600">{formatDate(u.last_login)}</span>
                    </div>
                    <span className="text-zinc-400">
                      {u.expires_at === null ? <span className="text-green-400">{t("unlimited")}</span>
                        : daysLeft === 0 ? <span className="text-red-400">Expired</span>
                        : <span className={daysLeft! < 7 ? "text-yellow-400" : "text-zinc-300"}>{daysLeft}d</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-1 border-t" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="h-8 w-8 p-0 text-zinc-400 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleDisable(u)}
                      className={`h-8 w-8 p-0 ${u.disabled ? "text-green-400" : "text-yellow-400"}`} disabled={u.username === "elmodmen"}>
                      {u.disabled ? <Check className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(u.id)}
                      className="h-8 w-8 p-0 text-red-400" disabled={u.username === "elmodmen"}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: Table View */}
          <div className="hidden md:block rounded-xl border overflow-hidden" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-zinc-400" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
                    <th className="text-left px-4 py-3 font-medium">{t("display_name")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("username")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("role")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("subscription")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("last_login")}</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-12 text-zinc-500">{t("loading")}</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-zinc-500">{t("no_results")}</td></tr>
                  ) : filtered.map((u) => {
                    const daysLeft = getDaysLeft(u.expires_at);
                    return (
                      <tr key={u.id} className="border-b hover:bg-white/3 transition-colors" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
                              {u.display_name[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-white">{u.display_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-zinc-300">@{u.username}</td>
                        <td className="px-4 py-3">
                          <Badge className={u.role === "admin" ? "bg-accent/20 text-accent border-accent/30" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}>
                            {u.role === "admin" ? <Crown className="w-3 h-3 mr-1 inline" /> : <User className="w-3 h-3 mr-1 inline" />}{u.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {u.expires_at === null ? <span className="text-green-400 text-xs">{t("unlimited")}</span>
                            : daysLeft === 0 ? <span className="text-red-400 text-xs">Expired</span>
                            : <span className={`text-xs ${daysLeft! < 7 ? "text-yellow-400" : "text-zinc-300"}`}><Clock className="w-3 h-3 inline mr-1" />{daysLeft} {t("days")}</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">{formatDate(u.last_login)}</td>
                        <td className="px-4 py-3">
                          <Badge className={u.disabled ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}>
                            {u.disabled ? <Ban className="w-3 h-3 mr-1 inline" /> : <Check className="w-3 h-3 mr-1 inline" />}
                            {u.disabled ? t("disabled") : t("active")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-white/10"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleDisable(u)}
                              className={`h-8 w-8 p-0 hover:bg-white/10 ${u.disabled ? "text-green-400" : "text-yellow-400"}`}
                              disabled={u.username === "elmodmen"}>
                              {u.disabled ? <Check className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(u.id)}
                              className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/10" disabled={u.username === "elmodmen"}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "system" && systemStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
          {[
            { label: "Hostname", value: systemStats.hostname, icon: Globe, desc: "Server hostname" },
            { label: "IP Address", value: systemStats.ip || "N/A", icon: Wifi, desc: "Public/local IP" },
            { label: "CPU Cores", value: systemStats.cpu_count, icon: Cpu, desc: "Processor cores" },
            { label: "CPU Usage", value: `${systemStats.cpu_percent?.toFixed(1)}%`, icon: Activity, desc: "Current CPU load" },
            { label: "Memory", value: `${systemStats.mem_used} / ${systemStats.mem_total}`, icon: HardDrive, desc: "RAM usage" },
            { label: "Disk", value: `${systemStats.disk_used} / ${systemStats.disk_total}`, icon: HardDrive, desc: "Disk usage" },
            { label: "Uptime", value: systemStats.uptime, icon: Clock, desc: "Server uptime" },
            { label: "Processes", value: systemStats.processes, icon: Activity, desc: "Running processes" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border p-3 md:p-4 flex items-center gap-3 md:gap-4" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
              <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(139,92,246,0.1)" }}>
                <item.icon className="w-[18px] h-[18px] md:w-5 md:h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] md:text-xs text-zinc-500">{item.desc}</p>
                <p className="text-xs md:text-sm font-semibold text-white truncate font-mono">{String(item.value)}</p>
              </div>
              <span className="text-[10px] md:text-xs text-zinc-600">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title={t("create_user")} onClose={() => setShowCreate(false)}>
          <UserForm form={form} setForm={setForm} isCreate t={t} />
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>{t("cancel")}</Button>
            <Button onClick={createUser} className="bg-primary hover:bg-primary/90">{t("create")}</Button>
          </div>
        </Modal>
      )}

      {editUser && (
        <Modal title={t("edit_user")} onClose={() => setEditUser(null)}>
          <div className="mb-4 p-3 rounded-lg bg-white/5"><span className="text-zinc-400 text-sm">@{editUser.username}</span></div>
          <UserForm form={form} setForm={setForm} isCreate={false} t={t} />
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="ghost" onClick={() => setEditUser(null)}>{t("cancel")}</Button>
            <Button onClick={updateUser} className="bg-primary hover:bg-primary/90">{t("save_changes")}</Button>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title={t("confirm_delete")} onClose={() => setDeleteConfirm(null)}>
          <p className="text-zinc-300 mb-6">{t("delete_confirm_msg")}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>{t("cancel")}</Button>
            <Button onClick={() => deleteUser(deleteConfirm)} className="bg-red-600 hover:bg-red-700">{t("delete")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="rounded-2xl border w-full max-w-md p-5 md:p-6 animate-scaleIn" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.3)" }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4 md:mb-5">
            <h3 className="font-semibold text-white text-sm md:text-base">{title}</h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X className="w-4 h-4 md:w-5 md:h-5" /></button>
          </div>
          {children}
        </div>
      </div>
  );
}

function UserForm({ form, setForm, isCreate, t }: any) {
  return (
    <div className="space-y-4">
      {isCreate && (
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">{t("username")} *</label>
          <Input value={form.username} onChange={(e: any) => setForm((p: any) => ({ ...p, username: e.target.value }))} className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white" />
        </div>
      )}
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">{t("display_name")}</label>
        <Input value={form.display_name} onChange={(e: any) => setForm((p: any) => ({ ...p, display_name: e.target.value }))} className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">{t("password")} {!isCreate && "(leave blank to keep)"}</label>
        <Input type="password" value={form.password} onChange={(e: any) => setForm((p: any) => ({ ...p, password: e.target.value }))} className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white" />
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">{t("role")}</label>
        <select value={form.role} onChange={(e: any) => setForm((p: any) => ({ ...p, role: e.target.value }))}
          className="w-full h-10 px-3 text-sm rounded-md bg-[#1d1033] border border-[rgba(139,92,246,0.3)] text-white outline-none">
          <option value="user">User</option><option value="admin">Admin</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-zinc-400 mb-1 block">{t("expires_in")} ({t("days")}) — 0 = {t("unlimited")}</label>
        <Input type="number" min="0" value={form.expires_days} onChange={(e: any) => setForm((p: any) => ({ ...p, expires_days: e.target.value }))} placeholder={t("no_expiry")} className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="disabled" checked={form.disabled} onChange={(e: any) => setForm((p: any) => ({ ...p, disabled: e.target.checked }))} className="w-4 h-4 rounded accent-purple-500" />
        <label htmlFor="disabled" className="text-sm text-zinc-300">{t("disabled")}</label>
      </div>
    </div>
  );
}
