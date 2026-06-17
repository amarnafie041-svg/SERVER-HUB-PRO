import { useState, useEffect } from "react";
import {
  Activity, TerminalSquare, Code, Folder, Bot,
  ChevronLeft, ChevronRight, Menu, Settings, User,
  Shield, LogOut, Globe, BookOpen, BarChart3, Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/language";

interface LayoutProps {
  children: React.ReactNode;
  path: string;
  navigate: (to: string) => void;
}

export function Layout({ children, path, navigate }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();
  const { t, lang, setLang, isRTL } = useLang();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const mainNavItems = [
    { href: "/", label: t("dashboard"), icon: Activity },
    { href: "/terminal", label: t("terminal"), icon: TerminalSquare },
    { href: "/editor", label: t("editor"), icon: Code },
    { href: "/ai", label: t("ai_chat"), icon: Bot },
    { href: "/commands", label: t("commands"), icon: BookOpen },
  ];

  const adminNavItemsFromMain = user?.role === "admin" ? [
    { href: "/files", label: t("files"), icon: Folder },
  ] : [];

  const adminNavItems = user?.role === "admin" ? [
    { href: "/admin", label: t("admin"), icon: Shield },
    { href: "/docker", label: "Docker", icon: Server },
    { href: "/activity", label: t("activity_log"), icon: BarChart3 },
    { href: "/settings", label: t("settings"), icon: Settings },
  ] : [];

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  const NavItem = ({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: any; onClick?: () => void }) => (
    <div onClick={() => { navigate(href); onClick?.(); }}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 group relative ${
        isActive(href) ? "bg-primary/20 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
      }`}>
      {isActive(href) && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
          style={{ background: "linear-gradient(180deg,#8b5cf6,#a855f7)" }} />
      )}
      <Icon className={`w-5 h-5 shrink-0 transition-all duration-300 ${isActive(href) ? "text-accent drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "text-zinc-500 group-hover:text-zinc-300 group-hover:scale-110"}`} />
      {!collapsed && <span className="font-medium text-sm truncate">{label}</span>}
      {isActive(href) && !collapsed && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      )}
    </div>
  );

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex flex-col h-full relative" style={{ background: "var(--sidebar)" }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 pointer-events-none opacity-30"
        style={{ background: "radial-gradient(ellipse at center top, rgba(139,92,246,0.4) 0%, transparent 70%)" }} />

      <div className="flex items-center px-4 h-16 border-b shrink-0 relative z-10" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ boxShadow: "0 0 15px rgba(139,92,246,0.3)" }}>
            <img src="/logo.jpg" alt="MODMEN" className="w-full h-full object-cover" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-white font-bold tracking-[0.2em] text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>EMD VPS</span>
              <span className="text-[9px] text-zinc-500 tracking-wider">v5</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto min-h-0 scrollbar-none">
        {mainNavItems.map((item) => <NavItem key={item.href} {...item} onClick={onNav} />)}
        {adminNavItemsFromMain.length > 0 && (
          <>{adminNavItemsFromMain.map((item) => <NavItem key={item.href} {...item} onClick={onNav} />)}</>
        )}
        {adminNavItems.length > 0 && (
          <>
            {!collapsed && <div className="px-3 pt-4 pb-1"><span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Admin</span></div>}
            {collapsed && <div className="my-2 border-t mx-3" style={{ borderColor: "var(--sidebar-border)" }} />}
            {adminNavItems.map((item) => <NavItem key={item.href} {...item} onClick={onNav} />)}
          </>
        )}

        {!collapsed && (
          <div className="px-3 pt-4 pb-1"><span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Theme</span></div>
        )}
        {!collapsed && <div className="px-2"><ThemeSwitcher /></div>}
      </div>

      <div className="border-t p-2 space-y-0.5 shrink-0" style={{ borderColor: "var(--sidebar-border)" }}>
        {!collapsed && (
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all text-sm">
            <Globe className="w-5 h-5 shrink-0" />
            <span>{lang === "en" ? "العربية" : "English"}</span>
          </button>
        )}
          <div onClick={() => { navigate("/profile"); onNav?.(); }}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all ${isActive("/profile") ? "bg-primary/20" : ""}`}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden"
              style={{ background: user?.avatar ? "none" : "linear-gradient(135deg,#6d28d9,#a855f7)" }}>
              {user?.avatar ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" /> : (user?.display_name || "?")[0].toUpperCase()}
            </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.display_name}</p>
              <p className="text-[10px] text-zinc-500 truncate">@{user?.username}</p>
            </div>
          )}
        </div>
        <button onClick={() => { logout(); onNav?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span className="text-sm font-medium">{t("logout")}</span>}
        </button>
        {!isMobile && (
          <button onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-2 text-zinc-600 hover:text-zinc-400 transition-colors">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex h-screen w-full overflow-hidden text-foreground ${isMobile ? "rounded-t-[24px]" : ""}`}
      style={{ background: "var(--background)", direction: isRTL ? "rtl" : "ltr" }}>
      {!isMobile && (
        <div className="flex-shrink-0 border-r transition-all duration-300 ease-in-out"
          style={{ width: collapsed ? "68px" : "232px", borderColor: "var(--sidebar-border)" }}>
          <SidebarContent />
        </div>
      )}

      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-30 animate-slideDown border-b"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", background: "var(--sidebar)", borderColor: "var(--sidebar-border)", boxShadow: "0 4px 30px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden"
                style={{ boxShadow: "0 0 12px rgba(139,92,246,0.3)" }}>
                <img src="/logo.jpg" alt="MODMEN" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-white text-xs tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>EMD VPS</span>
                <span className="text-[8px] text-zinc-600 tracking-wider">v5</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="relative">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden cursor-pointer border-2 border-transparent hover:border-accent/50 transition-all"
                  style={{ background: user?.avatar ? "none" : "linear-gradient(135deg,#6d28d9,#a855f7)" }}
                  onClick={() => setShowUserMenu(!showUserMenu)}>
                  {user?.avatar ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" /> : (user?.display_name || "?")[0].toUpperCase()}
                </div>
                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border py-1.5 shadow-2xl z-50 animate-scaleIn"
                    style={{ background: "var(--card)", borderColor: "var(--border)" }}
                    onMouseLeave={() => setShowUserMenu(false)}>
                    <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                      <p className="text-sm font-medium text-white truncate">{user?.display_name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">@{user?.username}</p>
                    </div>
                    <button onClick={() => { navigate("/profile"); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
                      <User className="w-4 h-4" /> Profile
                    </button>
                    <button onClick={() => { logout(); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setMobileOpen(true)} className="text-zinc-400 h-9 w-9 flex items-center justify-center hover:text-white transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={() => setMobileOpen(false)}>
          <div className="absolute left-0 inset-y-0 w-[280px] flex flex-col border-r animate-slideDown"
            style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}
            onClick={(e) => e.stopPropagation()}>
            <SidebarContent onNav={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isMobile ? "pt-[calc(3.5rem+env(safe-area-inset-top,0px))] pb-16" : ""}`}>
        <main className="flex-1 overflow-auto h-full">{children}</main>
      </div>

      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 h-16 z-30 border-t animate-slideUp"
          style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)", boxShadow: "0 -4px 30px rgba(0,0,0,0.3)" }}>
          <div className="flex items-center justify-around px-1 h-full">
            {(() => {
              const mobileItems = [
                ...mainNavItems.slice(0, 4),
                ...(user?.role === "admin" ? [{ href: "/files", label: t("files"), icon: Folder }] : []),
                { href: "/commands", label: t("commands"), icon: BookOpen },
              ];
              return mobileItems.map((item) => (
                <div key={item.href} onClick={() => navigate(item.href)}
                  className={`flex flex-col items-center justify-center w-14 h-full gap-0.5 cursor-pointer transition-all relative ${
                    isActive(item.href) ? "text-accent" : "text-zinc-500 hover:text-zinc-300"
                  }`}>
                  {isActive(item.href) && (
                    <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-accent" />
                  )}
                  <item.icon className={`w-5 h-5 transition-all duration-200 ${isActive(item.href) ? "scale-110 drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" : ""}`} />
                  <span className={`text-[9px] font-medium ${isActive(item.href) ? "font-bold" : ""}`}>{item.label}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
