import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "xterm/css/xterm.css";
import {
  Plus, X, TerminalSquare, Play, Square, RotateCcw,
  ZoomIn, ZoomOut, ShieldCheck, Settings,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";

type ConnStatus = "connecting" | "connected" | "reconnecting" | "offline";

interface Tab {
  id: string;
  name: string;
  sessionId: string;
  isolated?: boolean;
}

interface TabResources {
  ws: WebSocket | null;
  term: XTerm | null;
  fitAddon: FitAddon | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  resizeObserver: ResizeObserver | null;
  destroyed: boolean;
  reconnectAttempts: number;
}

interface StartupConfig {
  buildCmd: string;
  runCmd: string;
}

const MAX_RECONNECT = 99999;
const STORED_SESSION_KEY = "sh_terminal_session";

const S = (n: number) => " ".repeat(n);

const DESKTOP_BANNER = [
  "${bold}${grn}  ███████╗██╗     ███╗   ███╗ ██████╗ ██████╗ ███╗   ███╗███████╗███╗   ██╗",
  "${bold}${grn}  ██╔════╝██║     ████╗ ████║██╔═══██╗██╔══██╗████╗ ████║██╔════╝████╗  ██║",
  "${bold}${grn}  █████╗  ██║     ██╔████╔██║██║   ██║██║  ██║██╔████╔██║█████╗  ██╔██╗ ██║",
  "${bold}${grn}  ██╔══╝  ██║     ██║╚██╔╝██║██║   ██║██║  ██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║",
  "${bold}${grn}  ███████╗███████╗██║ ╚═╝ ██║╚██████╔╝██████╔╝██║ ╚═╝ ██║███████╗██║ ╚████║",
  "${bold}${grn}  ╚══════╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝",
  "",
  "${bold}${g(46)}  ══════════════════════════════════════════════════════════════════${rst}",
  "${bold}${g(46)}  ✓ CONNECTED  ${rst}${dim}║${rst}  ${g(226)}⚡ 𝐒𝐄𝐑𝐕𝐄𝐑 𝐇𝐔𝐁 ${rst}${dim}║${rst}  ${g(51)}🔒 SECURE ${rst}${dim}║${rst}  ${g(201)}🚀 READY${rst}",
  "${bold}${g(46)}  ══════════════════════════════════════════════════════════════════${rst}",
].join("\r\n");

const MOBILE_WELCOME = [
  "",
  "${bold}${g(201)}              Welcome To ELMODMEN World${rst}",
  "",
  " ${g(46)}✓${rst} Python • Node.js • PHP Supported",
  " ${g(46)}✓${rst} Fast Deployment & Auto Restart",
  " ${g(46)}✓${rst} Secure File Manager Access",
  " ${g(46)}✓${rst} 24/7 VPS Environment Online",
  "",
].join("\r\n");

export default function TerminalPage() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ConnStatus>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    return parseInt(localStorage.getItem("sh_term_font") || "14");
  });
  const [initialized, setInitialized] = useState(false);
  const [showKb, setShowKb] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [startup, setStartup] = useState<StartupConfig>({ buildCmd: "", runCmd: "" });
  const [showStartupPanel, setShowStartupPanel] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const resources = useRef<Record<string, TabResources>>({});
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    localStorage.setItem("sh_term_font", String(fontSize));
    for (const tabId of Object.keys(resources.current)) {
      const { term, fitAddon } = resources.current[tabId];
      if (term) { term.options.fontSize = fontSize; try { fitAddon?.fit(); } catch {} }
    }
  }, [fontSize]);

  useEffect(() => {
    return () => {
      for (const tabId of Object.keys(resources.current)) {
        const res = resources.current[tabId];
        res.destroyed = true;
        if (res.heartbeat) clearInterval(res.heartbeat);
        if (res.resizeObserver) res.resizeObserver.disconnect();
        if (res.ws) { res.ws.onclose = null; res.ws.close(); }
        if (res.term) res.term.dispose();
      }
      resources.current = {};
    };
  }, []);

  useEffect(() => {
    api.getStartupConfig().then((cfg) => {
      setStartup({ buildCmd: cfg.build_cmd || "", runCmd: cfg.run_cmd || "" });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const currentId = user?.id || null;
    if (prevUserIdRef.current !== null && prevUserIdRef.current !== currentId) {
      for (const tabId of Object.keys(resources.current)) {
        const res = resources.current[tabId];
        res.destroyed = true;
        if (res.heartbeat) clearInterval(res.heartbeat);
        if (res.resizeObserver) res.resizeObserver.disconnect();
        if (res.ws) { res.ws.onclose = null; res.ws.close(); }
        if (res.term) res.term.dispose();
      }
      resources.current = {};
      containerRefs.current = {};
      for (const tab of tabs) {
        api.killTerminalSession(tab.sessionId).catch(() => {});
      }
      setTabs([]);
      setActiveTabId(null);
      setStatuses({});
      localStorage.removeItem(STORED_SESSION_KEY);
      setInitialized(false);
    }
    prevUserIdRef.current = currentId;
  }, [user?.id]);

  const setStatus = (tabId: string, s: ConnStatus) =>
    setStatuses((prev) => ({ ...prev, [tabId]: s }));

  const buildWsUrl = (sessionId: string) => {
    const base = import.meta.env.VITE_API_URL || window.location.origin;
    const wsBase = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const token = localStorage.getItem("sh_token") || "";
    return `${wsBase}/api/terminal/ws/${sessionId}?token=${encodeURIComponent(token)}`;
  };

  const getRes = (tabId: string): TabResources => {
    if (!resources.current[tabId])
      resources.current[tabId] = {
        ws: null, term: null, fitAddon: null, heartbeat: null,
        resizeObserver: null, destroyed: false, reconnectAttempts: 0,
      };
    return resources.current[tabId];
  };

  const writeElmodmenBanner = (term: XTerm) => {
    const g = (code: number) => `\x1b[38;5;${code}m`;
    const rst = "\x1b[0m";
    const bold = "\x1b[1m";
    const dim = "\x1b[2m";
    const grn = g(46);
    const ylw = g(226);
    const cols = term.cols || 80;
    let raw;
    if (cols >= 80) {
      raw = DESKTOP_BANNER;
    } else {
      raw = MOBILE_WELCOME;
    }
    const banner = raw
      .replace(/\$\{grn\}/g, grn)
      .replace(/\$\{rst\}/g, rst)
      .replace(/\$\{bold\}/g, bold)
      .replace(/\$\{dim\}/g, dim)
      .replace(/\$\{ylw\}/g, ylw)
      .replace(/\$\{g\((\d+)\)\}/g, (_, c) => g(parseInt(c)));
    const bannerLines = raw.split('\r\n').length;
    const scrollStart = bannerLines + 1;
    term.write('\x1b[r' + banner + '\r\n\x1b[' + scrollStart + ';r\x1b[' + scrollStart + ';1H');
  };

  const sendToTerminal = (text: string) => {
    if (!activeTabId) return;
    const { ws } = getRes(activeTabId);
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "input", data: text }));
  };

  const connectWs = useCallback((tabId: string, sessionId: string) => {
    const res = getRes(tabId);
    if (res.destroyed) return;
    if (res.ws) { res.ws.onclose = null; res.ws.close(); }
    if (res.heartbeat) clearInterval(res.heartbeat);
    res.reconnectAttempts = 0;
    setStatus(tabId, "connecting");
    let ws: WebSocket;
    try { ws = new WebSocket(buildWsUrl(sessionId)); }
    catch { setStatus(tabId, "offline"); return; }
    res.ws = ws;
    let serverClosed = false;
    ws.onopen = () => {
      if (res.destroyed) { ws.close(); return; }
      res.reconnectAttempts = 0;
      setStatus(tabId, "connected");
      const { fitAddon, term } = getRes(tabId);
      if (fitAddon) {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        } catch {}
      }
      if (term) { term.clear(); writeElmodmenBanner(term); }
      res.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
    };
    ws.onmessage = (evt) => {
      if (res.destroyed) return;
      try {
        const msg = JSON.parse(evt.data as string);
        const { term } = getRes(tabId);
        if (msg.type === "output" && term) term.write(msg.data);
        else if (msg.type === "exit") {
          serverClosed = true;
          setIsRunning(false);
          setStatus(tabId, "offline");
          if (res.heartbeat) { clearInterval(res.heartbeat); res.heartbeat = null; }
        }
      } catch {}
    };
    ws.onclose = () => {
      if (res.destroyed) return;
      const r = getRes(tabId);
      if (r.heartbeat) { clearInterval(r.heartbeat); r.heartbeat = null; }
      if (serverClosed) { setStatus(tabId, "offline"); return; }
      r.reconnectAttempts++;
      if (r.reconnectAttempts >= MAX_RECONNECT) { setStatus(tabId, "offline"); return; }
      setStatus(tabId, "reconnecting");
      setTimeout(() => {
        if (!getRes(tabId).destroyed && (getRes(tabId).ws === ws || getRes(tabId).ws === null))
          connectWs(tabId, sessionId);
      }, 2000);
    };
    ws.onerror = () => { if (res.destroyed) return; setStatus(tabId, "offline"); };
  }, []);

  const mountTerminal = useCallback((tabId: string, el: HTMLDivElement, sessionId: string) => {
    const res = getRes(tabId);
    if (res.term || res.destroyed) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      const probe = new ResizeObserver(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) {
          probe.disconnect();
          if (!getRes(tabId).destroyed && !getRes(tabId).term)
            mountTerminal(tabId, el, sessionId);
        }
      });
      probe.observe(el);
      return;
    }
    const term = new XTerm({
      theme: {
        background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff",
        cursorAccent: "#0d1117",
        black: "#0d1117", red: "#ff7b72", green: "#3fb950", yellow: "#d29922",
        blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#c9d1d9",
        brightBlack: "#484f58", brightRed: "#ffa198", brightGreen: "#56d364",
        brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Noto Naskh Arabic", "Amiri", monospace',
      fontSize: fontSize,
      lineHeight: 1.2,
      letterSpacing: 0,
      fontWeight: "400", fontWeightBold: "700",
      cursorBlink: true, cursorStyle: "block",
      cursorInactiveStyle: "none",
      allowTransparency: true, scrollback: 50000,
      smoothScrollDuration: 0, drawBoldTextInBrightColors: true,
      minimumContrastRatio: 1, convertEol: true,
      scrollOnUserInput: true, tabStopWidth: 4,
      allowProposedApi: true,
      cols: 80,
      rows: 24,
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = "11";
    term.open(el);
    try { fitAddon.fit(); } catch {}
    res.term = term;
    res.fitAddon = fitAddon;
    const resizeObs = new ResizeObserver(() => {
      if (res.destroyed || !res.term) { resizeObs.disconnect(); return; }
      try {
        fitAddon.fit();
        var b = res.term.cols >= 80 ? DESKTOP_BANNER : MOBILE_WELCOME;
        var sl = b.split('\r\n').length + 1;
        res.term.write('\x1b[r\x1b[' + sl + ';r\x1b[' + sl + ';1H');
        const ws = res.ws;
        if (ws?.readyState === WebSocket.OPEN) {
          const dims = fitAddon.proposeDimensions();
          if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      } catch {}
    });
    resizeObs.observe(el);
    res.resizeObserver = resizeObs;
    term.onData((data) => {
      const { ws } = getRes(tabId);
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });
    term.clear();
    writeElmodmenBanner(term);
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });

    term.element?.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        const { ws } = getRes(tabId);
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data: text }));
      }).catch(() => {});
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown") {
        if (e.ctrlKey && e.shiftKey && (e.key === "c" || e.key === "C")) {
          const sel = term.getSelection();
          if (sel) navigator.clipboard.writeText(sel).catch(() => {});
          return false;
        }
        if (e.ctrlKey && e.shiftKey && (e.key === "v" || e.key === "V")) {
          navigator.clipboard.readText().then((text) => {
            const { ws } = getRes(tabId);
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data: text }));
          }).catch(() => {});
          return false;
        }
      }
      return true;
    });
    connectWs(tabId, sessionId);
  }, [connectWs, fontSize]);

  const createTab = useCallback(async (name?: string, existingSessionId?: string) => {
    const tabName = name || "Terminal";
    let sessionId = existingSessionId;
    let isolated = false;
    if (!sessionId) {
      try {
        const session = await api.createTerminalSession({ name: tabName });
        sessionId = session.id;
        isolated = (session as any).isolated || false;
      } catch {
        toast({ title: "Failed to create terminal", variant: "destructive" });
        return null;
      }
    }
    const tabId = sessionId;
    const newTab = { id: tabId, name: tabName, sessionId, isolated };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    localStorage.setItem(STORED_SESSION_KEY, sessionId);
    return newTab;
  }, [toast]);

  const closeTab = useCallback((tabId: string) => {
    const res = getRes(tabId);
    res.destroyed = true;
    if (res.heartbeat) clearInterval(res.heartbeat);
    if (res.resizeObserver) res.resizeObserver.disconnect();
    if (res.ws) { res.ws.onclose = null; res.ws.close(); }
    if (res.term) res.term.dispose();
    delete resources.current[tabId];
    delete containerRefs.current[tabId];
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) api.killTerminalSession(tab.sessionId).catch(() => {});
    setTabs((prev) => {
      const rem = prev.filter((t) => t.id !== tabId);
      if (rem.length === 0) {
        localStorage.removeItem(STORED_SESSION_KEY);
        setTimeout(() => createTab("Terminal"), 50);
      }
      setActiveTabId((curr) =>
        curr === tabId ? (rem.length > 0 ? rem[rem.length - 1].id : null) : curr
      );
      return rem;
    });
    setStatuses((prev) => { const n = { ...prev }; delete n[tabId]; return n; });
  }, [tabs, createTab]);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    const stored = localStorage.getItem(STORED_SESSION_KEY);
    if (stored) {
      api.checkSessionAlive(stored).then(({ alive }) => {
        if (alive) createTab("Terminal", stored);
        else { localStorage.removeItem(STORED_SESSION_KEY); createTab("Terminal"); }
      }).catch(() => { createTab("Terminal"); });
    } else { createTab("Terminal"); }
  }, [initialized, createTab]);

  useEffect(() => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const el = containerRefs.current[activeTabId];
    if (!el) return;
    const res = getRes(activeTabId);
    if (res.term) { try { res.fitAddon?.fit(); } catch {} return; }
    mountTerminal(activeTabId, el, tab.sessionId);
  }, [activeTabId, tabs, mountTerminal]);

  useEffect(() => {
    const handleResize = () => {
      for (const tabId of Object.keys(resources.current)) {
        const { fitAddon, ws } = resources.current[tabId];
        if (!fitAddon) continue;
        try {
          fitAddon.fit();
          if (ws?.readyState === WebSocket.OPEN) {
            const dims = fitAddon.proposeDimensions();
            if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
          }
        } catch {}
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSaveStartup = async () => {
    try {
      await api.updateStartupConfig({ build_cmd: startup.buildCmd, run_cmd: startup.runCmd });
      setShowStartupPanel(false);
      toast({ title: "Startup commands saved" });
    } catch {
      toast({ title: "Failed to save startup", variant: "destructive" });
    }
  };

  const handleStart = () => {
    const { buildCmd, runCmd } = startup;
    if (!runCmd.trim()) {
      toast({ title: "Set run command first", variant: "destructive" });
      setShowStartupPanel(true);
      return;
    }
    const status = statuses[activeTabId || ""];
    if (status !== "connected") {
      toast({ title: "Terminal not connected", variant: "destructive" });
      return;
    }
    if (buildCmd.trim()) {
      sendToTerminal(`${buildCmd.trim()} && ${runCmd.trim()}\r`);
    } else {
      sendToTerminal(`${runCmd.trim()}\r`);
    }
    setIsRunning(true);
  };

  const handleStop = () => {
    sendToTerminal("\x03");
    setIsRunning(false);
  };

  const handleRestart = () => {
    const { runCmd } = startup;
    if (!runCmd.trim()) {
      toast({ title: "Set run command first", variant: "destructive" });
      setShowStartupPanel(true);
      return;
    }
    const status = statuses[activeTabId || ""];
    if (status !== "connected") {
      toast({ title: "Terminal not connected", variant: "destructive" });
      return;
    }
    sendToTerminal("\x03");
    setTimeout(() => {
      sendToTerminal(`${runCmd.trim()}\r`);
      setIsRunning(true);
    }, 600);
  };

  const activeStatus = activeTabId ? statuses[activeTabId] : undefined;
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const StatusDot = ({ status }: { status: ConnStatus | undefined }) => {
    const colors: Record<string, string> = {
      connected: "bg-green-500", offline: "bg-red-500",
      reconnecting: "bg-yellow-500", connecting: "bg-yellow-500",
    };
    return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status || "connecting"]} ${status === "connecting" || status === "reconnecting" ? "animate-pulse" : ""}`} />;
  };

  const statusLabel = (s: ConnStatus | undefined) => {
    if (s === "connected") return "Connected";
    if (s === "offline") return "Offline";
    if (s === "reconnecting") return "Reconnecting...";
    return "Connecting";
  };

  const terminalBg = "var(--background)";
  const headerBg = "var(--card)";

  const dragState = useRef({ dragging: false, startX: 0, scrollLeft: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = tabsScrollRef.current;
    if (!el) return;
    dragState.current = { dragging: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = tabsScrollRef.current;
    if (!el || !dragState.current.dragging) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragState.current.startX) * 1.5;
    el.scrollLeft = dragState.current.scrollLeft - walk;
  };

  const stopDrag = () => { dragState.current.dragging = false; };

  return (
    <>
      <style>{`
        .terminal-container .xterm { padding: 3px; }
        .terminal-container .xterm-viewport { scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.25) transparent; }
        .terminal-container .xterm-viewport::-webkit-scrollbar { width: 4px; }
        .terminal-container .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.25); border-radius: 3px; }
        .terminal-container .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
        .terminal-container .xterm-rows { unicode-bidi: plaintext; direction: auto; }
        .terminal-container .xterm-rows > div { direction: auto; unicode-bidi: plaintext; }
        .terminal-container .xterm-rows .xterm-char-measur { font-feature-settings: "arab" 1; font-variant-ligatures: normal; }
        .terminal-container .xterm-rows span { unicode-bidi: plaintext; direction: auto; white-space: pre; }
        .terminal-container .xterm-rows .xterm-cursor { unicode-bidi: embed; }
        .terminal-container .xterm-rows .xterm-chars { unicode-bidi: plaintext; direction: auto; }
        .terminal-container .xterm-rows .xterm-char-measure-element { font-family: "Noto Naskh Arabic", "Amiri", "JetBrains Mono", monospace !important; }
        .terminal-container .xterm-rows .xterm-char-measure-element span { font-family: "Noto Naskh Arabic", "Amiri", "JetBrains Mono", monospace !important; }
        @keyframes panelSlide { from { max-height: 0; opacity: 0; } to { max-height: 200px; opacity: 1; } }
        .startup-panel { animation: panelSlide 0.2s ease-out; overflow: hidden; }
        .ctrl-btn { display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 10px; font-weight: 700; font-size: 11px; padding: 0 14px; height: 32px; transition: all 0.15s; cursor: pointer; user-select: none; white-space: nowrap; }
        .ctrl-btn:active { transform: scale(0.95); }
        .ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
        .startup-input { flex: 1; height: 30px; padding: 0 10px; font-size: 11px; font-family: "JetBrains Mono", monospace; border-radius: 8px; border: 1px solid rgba(139,92,246,0.2); background: var(--background); color: var(--foreground); outline: none; transition: border-color 0.15s; }
        .startup-input:focus { border-color: rgba(139,92,246,0.5); }
        .startup-input::placeholder { color: rgba(161,161,170,0.4); }
        .tab-btn { border-radius: 8px; cursor: pointer; transition: all 0.15s; user-select: none; }
        .tab-btn:hover { background: rgba(255,255,255,0.04); }
        @media (max-width: 820px) {
          .terminal-container .xterm { padding: 4px; }
          .xterm { font-size: 12px !important; }
          .xterm-rows > div { font-size: 12px !important; line-height: 1.25 !important; }
          .xterm-viewport { scrollbar-width: thin; }
          .xterm-screen { padding: 0; }
          .terminal-container { margin: 0 2px; }
        }
        @media (max-width: 600px) {
          .terminal-container .xterm { padding: 3px; }
          .xterm { font-size: 11px !important; }
          .xterm-rows > div { font-size: 11px !important; line-height: 1.2 !important; }
        }
        @media (max-width: 420px) {
          .terminal-container .xterm { padding: 2px; }
          .xterm { font-size: 10px !important; }
          .xterm-rows > div { font-size: 10px !important; line-height: 1.15 !important; }
        }
      `}</style>
      <div className={`flex flex-col overflow-hidden ${fullscreen ? "fixed inset-0 z-50" : "h-full"}`} style={{ background: terminalBg }}>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-0 sm:gap-1 px-1 sm:px-2 py-0.5 border-b shrink-0"
          style={{ background: headerBg, borderColor: "var(--border)" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={stopDrag} onMouseLeave={stopDrag}>

          {/* Tabs */}
          <div ref={tabsScrollRef}
            className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0 scrollbar-none cursor-grab active:cursor-grabbing py-0.5"
            style={{ scrollBehavior: "smooth" }}>
            {tabs.map((tab) => {
              const status = statuses[tab.id];
              const isActive = tab.id === activeTabId;
              return (
                <div key={tab.id} onClick={() => setActiveTabId(tab.id)}
                  className={`tab-btn flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono whitespace-nowrap group shrink-0 select-none border ${
                    isActive ? "bg-primary/15 text-foreground border-accent/25 shadow-[0_0_10px_rgba(139,92,246,0.08)]" : "text-zinc-500 hover:text-zinc-300 border-transparent"
                  }`}>
                  <StatusDot status={status} />
                  {tab.isolated && <ShieldCheck className="w-3 h-3 text-green-400/70" />}
                  <TerminalSquare className={`w-3.5 h-3.5 ${isActive ? "text-accent" : "text-zinc-600"}`} />
                  <span className="text-[11px]">{tab.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all p-0.5 rounded"><X className="w-3 h-3" /></button>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => createTab()}
              className="h-7 px-1.5 shrink-0 gap-1 text-[11px] font-bold text-accent hover:text-accent/80" title="New Terminal">
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0 flex-wrap py-0.5">

            {activeTabId && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md shrink-0 text-zinc-600 font-mono">
                <StatusDot status={activeStatus} />
                {statusLabel(activeStatus)}
              </span>
            )}

            {/* Startup controls */}
            <button onClick={() => setShowStartupPanel(!showStartupPanel)}
              title="Startup Config"
              className="ctrl-btn h-8 !px-2 text-zinc-400 hover:text-white hover:bg-white/5 !rounded-lg"
              style={{ background: "transparent" }}>
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button onClick={handleStart}
              title="Start"
              disabled={!startup.runCmd.trim()}
              className="ctrl-btn h-8 !px-2.5 text-green-400 hover:text-green-300 hover:bg-green-500/10 !rounded-lg"
              style={{ background: "transparent" }}>
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px]">Start</span>
            </button>

            <button onClick={handleRestart}
              title="Restart"
              disabled={!startup.runCmd.trim()}
              className="ctrl-btn h-8 !px-2.5 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 !rounded-lg"
              style={{ background: "transparent" }}>
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px]">Restart</span>
            </button>

            <button onClick={handleStop}
              title="Stop"
              className="ctrl-btn h-8 !px-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 !rounded-lg"
              style={{ background: "transparent" }}>
              <Square className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px]">Stop</span>
            </button>

            {/* Font size */}
            <div className="flex items-center gap-0.5 pl-1.5 ml-1 border-l" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => setFontSize((s) => Math.max(10, s - 1))} title="Decrease font"
                className="ctrl-btn h-8 !px-2 text-zinc-500 hover:text-white hover:bg-white/5 !rounded-lg"
                style={{ background: "transparent" }}>
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-mono text-zinc-600 w-5 text-center select-none">{fontSize}</span>
              <button onClick={() => setFontSize((s) => Math.min(28, s + 1))} title="Increase font"
                className="ctrl-btn h-8 !px-2 text-zinc-500 hover:text-white hover:bg-white/5 !rounded-lg"
                style={{ background: "transparent" }}>
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Startup Config Panel */}
        {showStartupPanel && (
          <div className="startup-panel border-b px-3 py-2.5 shrink-0"
            style={{ background: headerBg, borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Startup Configuration</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 w-16 shrink-0 text-right">Build</span>
                <input
                  value={startup.buildCmd}
                  onChange={(e) => setStartup({ ...startup, buildCmd: e.target.value })}
                  placeholder="npm install && npm run build  (optional)"
                  className="startup-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 w-16 shrink-0 text-right">Run</span>
                <input
                  value={startup.runCmd}
                  onChange={(e) => setStartup({ ...startup, runCmd: e.target.value })}
                  placeholder="node index.js  /  python3 main.py  /  php index.php"
                  className="startup-input"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveStartup(); }}
                />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <button onClick={handleSaveStartup}
                  className="ctrl-btn h-7 text-[10px] font-bold"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(139,92,246,0.15))", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.2)" }}>
                  Save
                </button>
                <span className="text-[9px] text-zinc-600 font-mono">
                  {startup.buildCmd.trim() ? `Build: ${startup.buildCmd.slice(0, 30)}...` : "No build command"}
                  {" | "}
                  {startup.runCmd.trim() ? `Run: ${startup.runCmd.slice(0, 30)}...` : "No run command"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Terminal content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 relative overflow-hidden min-h-0">
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                </div>
                <p className="text-zinc-500 text-sm font-mono">Starting terminal...</p>
              </div>
            ) : (
              tabs.map((tab) => (
                <div key={tab.id} className="absolute inset-0 p-0.5" style={{ display: tab.id === activeTabId ? "flex" : "none", flexDirection: "column" }}>
                  <div ref={(el) => { containerRefs.current[tab.id] = el; }}
                    className="terminal-container flex-1 min-h-0 rounded overflow-hidden"
                    style={{ boxShadow: "0 0 20px rgba(139,92,246,0.12), 0 0 40px rgba(139,92,246,0.04), inset 0 0 0 1px rgba(139,92,246,0.08)" }} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Mobile keyboard */}
        {isMobile && (
          <div className="border-t shrink-0" style={{ background: "linear-gradient(180deg, rgba(20,10,36,0.95), rgba(10,6,22,0.98))", borderColor: "var(--border)", backdropFilter: "blur(8px)" }}>
            <div className="flex items-center justify-between px-3 py-1 border-b" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => setShowKb(!showKb)}
                className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-white/5">
                {showKb ? "Hide" : "Keys"}
              </button>
              <div className="flex items-center gap-1.5">
                <button onClick={handleStart} disabled={!startup.runCmd.trim()}
                  className="text-[10px] font-medium text-green-400/80 hover:text-green-300 px-2.5 py-1 rounded-lg hover:bg-green-500/10 transition-all disabled:opacity-40">Start</button>
                <button onClick={handleRestart} disabled={!startup.runCmd.trim()}
                  className="text-[10px] font-medium text-yellow-400/80 hover:text-yellow-300 px-2.5 py-1 rounded-lg hover:bg-yellow-500/10 transition-all disabled:opacity-40">Restart</button>
                <button onClick={handleStop}
                  className="text-[10px] font-medium text-red-400/80 hover:text-red-300 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition-all">Stop</button>
                <span className="text-[9px] text-zinc-700 font-mono ml-1 px-1.5 py-0.5 rounded-md bg-white/5">{tabs.length}</span>
              </div>
            </div>
            {showKb && (
              <div className="p-2 overflow-x-auto">
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {[{ l: "Tab", v: "\t" }, { l: "Ctrl", v: "ctrl" }, { l: "Esc", v: "\x1b" },
                    { l: "▲", v: "\x1b[A" }, { l: "▼", v: "\x1b[B" }, { l: "◀", v: "\x1b[D" }, { l: "▶", v: "\x1b[C" }].map((key) => (
                    <button key={key.l} onClick={() => {
                      const { ws } = getRes(activeTabId!);
                      if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: "input", data: key.l === "Ctrl" ? "\x03" : key.v }));
                      }
                    }}
                      className="min-w-[44px] min-h-[38px] flex items-center justify-center rounded-lg border border-purple-500/20 bg-gray-900/80 text-gray-400 text-xs font-semibold cursor-pointer active:scale-95 active:bg-purple-500/25 active:text-white transition-all">
                      {key.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status bar */}
        {activeTabId && tabs.length > 0 && !isMobile && (
          <div className="flex items-center justify-between px-3 py-1 border-t shrink-0 text-[10px] font-mono"
            style={{ background: headerBg, borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 text-zinc-600">
              <StatusDot status={activeStatus} />
              <span>{statusLabel(activeStatus)}</span>
              {activeTab?.isolated && (
                <span className="flex items-center gap-1 text-green-500/70 ml-2">
                  <ShieldCheck className="w-2.5 h-2.5" /> Isolated
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-zinc-700">
              {startup.runCmd.trim() && (
                <span className="text-zinc-600 truncate max-w-[200px]">
                  {isRunning ? "● Running" : ""} {startup.runCmd}
                </span>
              )}
              <span>{tabs.length} tab(s)</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
