import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/language";
import { api, authFetch } from "@/lib/api";
import { Camera, User, Lock, Shield, Clock, CheckCircle2, Calendar, BadgeCheck, AlertTriangle, Mail, AtSign, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, refreshMe, updateProfileLocally } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(user?.display_name || "");
    setAvatar(user?.avatar || null);
  }, [user?.display_name, user?.avatar]);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"profile" | "password">("profile");

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (newPass && newPass !== confirmPass) {
      toast({ title: t("error"), description: t("passwords_dont_match"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { display_name: displayName };
      if (avatar !== user?.avatar) body.avatar = avatar;
      if (newPass) { body.current_password = currentPass; body.new_password = newPass; }
      const res = await authFetch(`/api/auth/profile`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: t("success"), description: t("profile_updated") });
        updateProfileLocally({ display_name: displayName, avatar });
        await refreshMe();
        setCurrentPass(""); setNewPass(""); setConfirmPass("");
      } else {
        const d = await res.json();
        toast({ title: t("error"), description: d.message, variant: "destructive" });
      }
    } finally { setSaving(false); }
  };

  const getDaysLeft = () => {
    if (!user?.expires_at) return null;
    const diff = new Date(user.expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  };

  const daysLeft = getDaysLeft();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-6">
      <div className="animate-fadeIn">
        <h1 className="text-xl md:text-2xl font-bold">{t("profile_title")}</h1>
        <p className="text-zinc-400 text-sm mt-1">{t("account_info")}</p>
      </div>

      <div className="rounded-2xl border p-4 md:p-6 relative overflow-hidden animate-fadeIn"
        style={{ background: "linear-gradient(135deg, #140a24 0%, #1a0e30 100%)", borderColor: "rgba(139,92,246,0.2)" }}>
        <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none opacity-10"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)" }} />
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 relative z-10">
          <div className="relative group">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-2xl md:text-3xl font-bold overflow-hidden border-2 transition-all duration-300 group-hover:border-accent"
              style={{ borderColor: "#a855f7", background: "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
              {avatar ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" /> : <span>{(user?.display_name || "?")[0].toUpperCase()}</span>}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#0b0616] transition-all duration-200 hover:scale-110 hover:bg-accent"
              style={{ background: "#6d28d9" }}>
              <Camera className="w-4 h-4 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="text-center md:text-left flex-1">
            <h2 className="text-lg md:text-xl font-bold text-white">{user?.display_name}</h2>
            <p className="text-zinc-500 text-sm">@{user?.username}</p>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: user?.role === "admin" ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.15)", color: user?.role === "admin" ? "#a855f7" : "#3b82f6", border: `1px solid ${user?.role === "admin" ? "rgba(168,85,247,0.3)" : "rgba(59,130,246,0.3)"}` }}>
                <BadgeCheck className="w-3 h-3" /> {user?.role}
              </span>
              {user?.expires_at === null ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <CheckCircle2 className="w-3 h-3" /> {t("unlimited")}
                </span>
              ) : daysLeft !== null && daysLeft < 7 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid rgba(234,179,8,0.3)" }}>
                  <AlertTriangle className="w-3 h-3" /> {daysLeft} {t("days")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="space-y-4">
          <div className="rounded-2xl border p-4 space-y-3 animate-fadeIn" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-semibold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" /> {t("account_info")}
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {t("role")}</span>
                <span className="text-white capitalize font-medium">{user?.role}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {t("subscription")}</span>
                {user?.expires_at === null ? <span className="text-green-400 font-medium">{t("unlimited")}</span>
                  : daysLeft === 0 ? <span className="text-red-400 font-medium">Expired</span>
                  : <span className={daysLeft! < 7 ? "text-yellow-400 font-medium" : "text-white font-medium"}>{daysLeft} {t("days")}</span>}
              </div>
              {user?.expires_at && (
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("expires")}</span>
                  <span className="text-zinc-300 text-xs font-mono">{new Date(user.expires_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar preview */}
          <div className="rounded-2xl border p-4 animate-fadeIn hidden lg:block" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
            <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
              <AtSign className="w-3.5 h-3.5" /> Preview
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5 border" style={{ borderColor: "rgba(139,92,246,0.15)" }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden"
                style={{ background: avatar ? "none" : "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
                {avatar ? <img src={avatar} className="w-full h-full object-cover" /> : <span className="text-white">{(displayName || "?")[0].toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{displayName || user?.username}</p>
                <p className="text-[10px] text-zinc-500">@{user?.username}</p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2 text-center">Appears in sidebar &amp; navbar</p>
          </div>

          <div className="flex lg:hidden gap-1 p-1 rounded-xl border" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
            <button onClick={() => setActiveSection("profile")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeSection === "profile" ? "bg-primary/20 text-white" : "text-zinc-500"}`}>
              <User className="w-3.5 h-3.5 inline mr-1" /> Profile
            </button>
            <button onClick={() => setActiveSection("password")}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeSection === "password" ? "bg-primary/20 text-white" : "text-zinc-500"}`}>
              <Lock className="w-3.5 h-3.5 inline mr-1" /> Password
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className={`rounded-2xl border p-4 md:p-5 animate-fadeIn ${activeSection !== "profile" ? "hidden lg:block" : ""}`}
            style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
            <div className="flex items-center gap-2 mb-4 text-sm font-medium text-zinc-300">
              <User className="w-4 h-4 text-accent" /> {t("display_name")}
            </div>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white placeholder:text-zinc-600" placeholder={t("display_name")} />
          </div>

          <div className={`rounded-2xl border p-4 md:p-5 animate-fadeIn ${activeSection !== "password" ? "hidden lg:block" : ""}`}
            style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
            <div className="flex items-center gap-2 mb-4 text-sm font-medium text-zinc-300">
              <Lock className="w-4 h-4 text-accent" /> {t("change_password")}
            </div>
            <div className="space-y-3">
              <Input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)}
                placeholder={t("current_password")} className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white placeholder:text-zinc-600" />
              <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)}
                placeholder={t("new_password")} className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white placeholder:text-zinc-600" />
              <Input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                placeholder={t("confirm_password")}
                className={`bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white placeholder:text-zinc-600 ${newPass && confirmPass && newPass !== confirmPass ? "border-red-500/60" : ""}`} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}
            className="w-full h-10 md:h-11 font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("loading")}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-4 h-4" /> {t("save_profile")}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
