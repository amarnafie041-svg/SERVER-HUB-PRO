import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "xterm/css/xterm.css";
import {
  Plus, X, RotateCcw, RefreshCcw, Trash2, TerminalSquare,
  Maximize2, Minimize2, Play, Square, FileCode,
  ZoomIn, ZoomOut, Keyboard, GitBranch, Terminal as TerminalIcon,
  FileText, ShieldCheck, Package, Download, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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

const MAX_RECONNECT = 15;
const STORED_SESSION_KEY = "sh_terminal_session";

const QUICK_CMDS = [
  { label: "clear", icon: Trash2, cmd: "clear\r", color: "#6b7280" },
  { label: "ls -la", icon: FileText, cmd: "ls -la\r", color: "#22c55e" },
  { label: "nano", icon: FileText, cmd: "nano ", color: "#22c55e" },
  { label: "git clone + run", icon: GitBranch, cmd: "git clone <url> && cd <repo> && npm install && npm start\r", color: "#f05032" },
  { label: "auto-serve", icon: Globe, cmd: "auto-serve \"python3 -m http.server {PORT}\" 8000\r", color: "#8b5cf6" },
  { label: "python3", icon: FileCode, cmd: "python3\r", color: "#3776ab" },
  { label: "npm start", icon: TerminalIcon, cmd: "npm start\r", color: "#cb3837" },
  { label: "git clone", icon: GitBranch, cmd: "git clone ", color: "#f05032" },
  { label: "pip install -r", icon: FileCode, cmd: "pip install -r requirements.txt\r", color: "#ff7b72" },
  { label: "node index.js", icon: TerminalIcon, cmd: "node index.js\r", color: "#58a6ff" },
  { label: "php -S", icon: TerminalIcon, cmd: "auto-serve \"php -S 0.0.0.0:{PORT}\" 8000\r", color: "#8892bf" },
  { label: "cat /etc/os-release", icon: FileText, cmd: "cat /etc/os-release\r", color: "#d29922" },
  { label: "ps aux", icon: TerminalSquare, cmd: "ps aux\r", color: "#bc8cff" },
  { label: "htop", icon: TerminalSquare, cmd: "htop\r", color: "#22c55e" },
  { label: "curl ifconfig.me", icon: TerminalIcon, cmd: "curl -s ifconfig.me\r", color: "#39c5cf" },
];

const VIRTUAL_KEYS = [
  { label: "Tab", value: "\t", color: "#6d28d9" },
  { label: "Ctrl", value: "ctrl", color: "#7c3aed", isCtrl: true },
  { label: "Esc", value: "\x1b", color: "#ef4444" },
  { label: "▲", value: "\x1b[A", color: "#8b5cf6" },
  { label: "▼", value: "\x1b[B", color: "#8b5cf6" },
  { label: "◀", value: "\x1b[D", color: "#8b5cf6" },
  { label: "▶", value: "\x1b[C", color: "#8b5cf6" },
];

const MOBILE_BANNER = [
  "${grn}╔═══════════════════════════╗${rst}",
  "${grn}║${rst}  ${bold}${ylw}ELMODMEN  SERVER  HUB${rst}  ${grn}║${rst}",
  "${grn}║${rst}  ${bold}${ylw}v6 — Terminal Ready${rst}    ${grn}║${rst}",
  "${grn}║${rst}  ${dim}${g(245)}Type your commands below${rst} ${grn}║${rst}",
  "${grn}╚═══════════════════════════╝${rst}",
  "",
  "${dim}┌──(${rst}${ylw}runner${rst}${dim}㉿${rst}${ylw}serverhub${rst}${dim})-[${rst}${cyn}~${rst}${dim}]${rst}",
  "${dim}└─${rst}$ ",
].join("\r\n");

const ELMODMEN_BANNER = [
  "${grn}╔══════════════════════════════════════════════════════════════╗${rst}",
  "${grn}║${rst}  ${bold}${ylw}███████╗██╗     ███╗   ███╗ ██████╗ ██████╗ ███╗   ███╗███████╗███╗   ██╗${rst}  ${grn}║${rst}",
  "${grn}║${rst}  ${bold}${ylw}██╔════╝██║     ████╗ ████║██╔═══██╗██╔══██╗████╗ ████║██╔════╝████╗  ██║${rst}  ${grn}║${rst}",
  "${grn}║${rst}  ${bold}${ylw}█████╗  ██║     ██╔████╔██║██║   ██║██║  ██║██╔████╔██║█████╗  ██╔██╗ ██║${rst}  ${grn}║${rst}",
  "${grn}║${rst}  ${bold}${ylw}██╔══╝  ██║     ██║╚██╔╝██║██║   ██║██║  ██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║${rst}  ${grn}║${rst}",
  "${grn}║${rst}  ${bold}${ylw}███████╗███████╗██║ ╚═╝ ██║╚██████╔╝██████╔╝██║ ╚═╝ ██║███████╗██║ ╚████║${rst}  ${grn}║${rst}",
  "${grn}║${rst}  ${bold}${ylw}╚══════╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝${rst}  ${grn}║${rst}",
  "${grn}║${rst}                                                                                    ${grn}║${rst}",
  "${grn}║${rst}              ${bold}${g(250)}██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ ██╗  ██╗${rst}              ${grn}║${rst}",
  "${grn}║${rst}              ${bold}${g(250)}██║  ██║██║   ██║██╔══██╗██╔════╝██╔══██╗██║  ██║${rst}              ${grn}║${rst}",
  "${grn}║${rst}              ${bold}${g(250)}███████║██║   ██║██████╔╝█████╗  ██████╔╝███████║${rst}              ${grn}║${rst}",
  "${grn}║${rst}              ${bold}${g(250)}██╔══██║██║   ██║██╔══██╗██╔══╝  ██╔══██╗██╔══██║${rst}              ${grn}║${rst}",
  "${grn}║${rst}              ${bold}${g(250)}██║  ██║╚██████╔╝██████╔╝███████╗██║  ██║██║  ██║${rst}              ${grn}║${rst}",
  "${grn}║${rst}              ${bold}${g(250)}╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝${rst}              ${grn}║${rst}",
  "${grn}║${rst}                                                                                    ${grn}║${rst}",
  "${grn}║${rst}    ${dim}${g(245)}SERVER HUB v6 — Isolated Sandbox Terminal${rst}    ${grn}║${rst}",
  "${grn}║${rst}    ${dim}${g(245)}Type your commands below after the prompt sign ${rst}${ylw}$${rst}${dim}${g(245)}                          ${rst}    ${grn}║${rst}",
  "${grn}╚══════════════════════════════════════════════════════════════╝${rst}",
  "",
  "${dim}┌──(${rst}${ylw}runner${rst}${dim}㉿${rst}${ylw}serverhub${rst}${dim})-[${rst}${cyn}~${rst}${dim}]${rst}",
  "${dim}└─${rst}$ ",
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
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [runCmd, setRunCmd] = useState("");
  const [installCmd, setInstallCmd] = useState("");

  const RUN_PRESETS = [
    { label: "▶ python3 main.py", cmd: "python3 main.py", lang: "py" },
    { label: "▶ node index.js", cmd: "node index.js", lang: "js" },
    { label: "▶ npm start", cmd: "npm start", lang: "js" },
    { label: "▶ python3 app.py", cmd: "python3 app.py", lang: "py" },
    { label: "▶ php index.php", cmd: "php index.php", lang: "php" },
    { label: "▶ go run main.go", cmd: "go run main.go", lang: "go" },
    { label: "▶ bash script.sh", cmd: "bash script.sh", lang: "sh" },
    { label: "─────────────", cmd: "", lang: "sep" },
    { label: "🌐 Serve HTTP 8000", cmd: "auto-serve \"python3 -m http.server {PORT}\" 8000", lang: "py" },
    { label: "🌐 Serve Node.js", cmd: "auto-serve \"node server.js --port {PORT}\" 3000", lang: "js" },
    { label: "🌐 Serve PHP", cmd: "auto-serve \"php -S 0.0.0.0:{PORT}\" 8000", lang: "php" },
    { label: "🌐 npm run dev (Vite)", cmd: "auto-serve \"npx vite --port {PORT}\" 5173", lang: "js" },
    { label: "🌐 npx serve", cmd: "auto-serve \"npx serve -l {PORT}\" 3000", lang: "js" },
    { label: "─────────────", cmd: "", lang: "sep" },
    { label: "📦 git clone + install + run", cmd: "git clone <url> && cd <repo> && npm install && npm start", lang: "js" },
    { label: "📦 git clone + pip install", cmd: "git clone <url> && cd <repo> && pip install -r requirements.txt && python3 main.py", lang: "py" },
    { label: "📦 git clone + composer", cmd: "git clone <url> && cd <repo> && composer install && php -S 0.0.0.0:8000", lang: "php" },
  ];

  const INSTALL_PRESETS = [
    { label: "pip install -r requirements.txt", cmd: "pip install -r requirements.txt", lang: "py" },
    { label: "npm install", cmd: "npm install", lang: "js" },
    { label: "yarn install", cmd: "yarn install", lang: "js" },
    { label: "pnpm install", cmd: "pnpm install", lang: "js" },
    { label: "go mod tidy", cmd: "go mod tidy", lang: "go" },
    { label: "composer install", cmd: "composer install", lang: "php" },
    { label: "pip install flask", cmd: "pip install flask", lang: "py" },
    { label: "pip install django", cmd: "pip install django", lang: "py" },
    { label: "pip install fastapi", cmd: "pip install fastapi uvicorn", lang: "py" },
    { label: "bundle install (Ruby)", cmd: "bundle install", lang: "ruby" },
    { label: "gem install rails", cmd: "gem install rails", lang: "ruby" },
    { label: "cargo build (Rust)", cmd: "cargo build", lang: "rust" },
    { label: "apt install package", cmd: "apt install <package> -y", lang: "sh" },
  ];

  const resources = useRef<Record<string, TabResources>>({});
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

  const setStatus = (tabId: string, s: ConnStatus) =>
    setStatuses((prev) => ({ ...prev, [tabId]: s }));

  const buildWsUrl = (sessionId: string) => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/terminal/ws/${sessionId}`;
  };

  const welcomeShown = useRef<Record<string, boolean>>({});

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
    const cyn = g(87);
    const cols = term.cols || 80;
    const banner = (cols < 50 ? MOBILE_BANNER : ELMODMEN_BANNER)
      .replace(/\$\{grn\}/g, grn)
      .replace(/\$\{rst\}/g, rst)
      .replace(/\$\{bold\}/g, bold)
      .replace(/\$\{dim\}/g, dim)
      .replace(/\$\{ylw\}/g, ylw)
      .replace(/\$\{cyn\}/g, cyn)
      .replace(/\$\{g\((\d+)\)\}/g, (_, c) => g(parseInt(c)));
    term.write(banner);
  };

  const sendToTerminal = (text: string) => {
    if (!activeTabId) return;
    const { ws } = getRes(activeTabId);
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "input", data: text }));
  };

  const handleQuickCmd = (cmd: string) => {
    sendToTerminal(cmd + (cmd.endsWith(" ") ? "" : "\r"));
    setShowQuickCmds(false);
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
      const { fitAddon } = getRes(tabId);
      if (fitAddon) {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        } catch {}
      }
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
      letterSpacing: 0.2,
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
    if (!welcomeShown.current[tabId]) {
      welcomeShown.current[tabId] = true;
      writeElmodmenBanner(term);
    }
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown") {
        if (e.ctrlKey && e.shiftKey && (e.key === "c" || e.key === "C")) {
          const sel = term.getSelection();
          if (sel) navigator.clipboard.writeText(sel).catch(() => {});
          return false;
        }
        if (e.ctrlKey && (e.key === "v" || e.key === "V")) {
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

  const clearActive = () => { if (activeTabId) getRes(activeTabId).term?.clear(); };
  const resetActive = () => { if (activeTabId) getRes(activeTabId).term?.reset(); };
  const runActive = () => sendToTerminal("\r");
  const stopActive = () => sendToTerminal("\x03");

  const handleRunCmd = () => {
    if (runCmd.trim()) { sendToTerminal(runCmd.trim() + "\r"); setShowRunDialog(false); setRunCmd(""); }
  };

  const handleInstallCmd = () => {
    if (installCmd.trim()) { sendToTerminal(installCmd.trim() + "\r"); setShowInstallDialog(false); setInstallCmd(""); }
  };

  const restartActive = () => {
    if (!activeTabId) return;
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    const res = getRes(activeTabId);
    res.destroyed = true;
    if (res.ws) { res.ws.onclose = null; res.ws.close(); }
    if (res.heartbeat) clearInterval(res.heartbeat);
    if (res.resizeObserver) res.resizeObserver.disconnect();
    if (res.term) res.term.dispose();
    delete resources.current[activeTabId];
    setStatuses((prev) => ({ ...prev, [activeTabId]: "connecting" }));
    setTimeout(() => {
      const el = containerRefs.current[activeTabId];
      if (el) mountTerminal(activeTabId, el, tab.sessionId);
    }, 150);
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
        .terminal-container .xterm { padding: 2px; }
        .terminal-container .xterm-viewport { scrollbar-width: thin; scrollbar-color: rgba(139,92,246,0.3) transparent; }
        .terminal-container .xterm-viewport::-webkit-scrollbar { width: 4px; }
        .terminal-container .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 3px; }
        .terminal-container .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
        .terminal-container .xterm-rows { unicode-bidi: plaintext; direction: auto; }
        .terminal-container .xterm-rows > div { direction: auto; unicode-bidi: plaintext; }
        .terminal-container .xterm-rows .xterm-char-measur { font-feature-settings: "arab" 1; font-variant-ligatures: no-contextual; }
        .terminal-container .xterm-rows span { unicode-bidi: plaintext; direction: auto; white-space: pre; }
        .terminal-container .xterm-rows .xterm-cursor { unicode-bidi: embed; }
        .terminal-container .xterm-rows .xterm-chars { unicode-bidi: plaintext; direction: auto; }
        .terminal-container .xterm-rows .xterm-char-measure-element { font-family: "Noto Naskh Arabic", "Amiri", "JetBrains Mono", monospace; }
        .terminal-container .xterm-rows .xterm-char-measure-element span { font-family: "Noto Naskh Arabic", "Amiri", "JetBrains Mono", monospace; }
        .run-dropdown-enter { animation: dropFadeIn 0.15s ease-out; }
        @keyframes dropFadeIn { from { opacity: 0; transform: translateY(-4px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .virt-kb-btn { min-width: 44px; min-height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid rgba(139,92,246,0.2); background: rgba(20,10,36,0.8); color: #a1a1aa; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s; user-select: none; }
        .virt-kb-btn:active { transform: scale(0.92); background: rgba(139,92,246,0.2); color: white; }
        .quick-cmd-btn { padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; white-space: nowrap; user-select: none; }
        .quick-cmd-btn:active { transform: scale(0.95); }
        @media (max-width: 767px) {
          .terminal-container .xterm { padding: 1px; }
          .xterm { font-size: 10px !important; }
          .xterm-rows > div { font-size: 10px !important; line-height: 1.0 !important; }
          .xterm-viewport { scrollbar-width: thin; }
          .xterm-screen { padding: 0; }
        }
        @media (max-width: 480px) {
          .terminal-container .xterm { padding: 0; }
          .xterm { font-size: 9px !important; }
          .xterm-rows > div { font-size: 9px !important; line-height: 1.0 !important; }
        }
      `}</style>
      <div className={`flex flex-col overflow-hidden ${fullscreen ? "fixed inset-0 z-50" : "h-full"}`} style={{ background: terminalBg }}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-0 sm:gap-1 px-1 sm:px-2 py-1 border-b shrink-0"
          style={{ background: headerBg, borderColor: "var(--border)" }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={stopDrag} onMouseLeave={stopDrag}>

          <div ref={tabsScrollRef}
            className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0 scrollbar-none cursor-grab active:cursor-grabbing py-1 sm:py-0"
            style={{ scrollBehavior: "smooth" }}>
            {tabs.map((tab) => {
              const status = statuses[tab.id];
              const isActive = tab.id === activeTabId;
              return (
                <div key={tab.id} onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs font-mono whitespace-nowrap group shrink-0 select-none ${
                    isActive ? "bg-primary/20 text-foreground border border-accent/30" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
                  }`}>
                  <StatusDot status={status} />
                  {tab.isolated && <span title="Isolated"><ShieldCheck className="w-3 h-3 text-green-400" /></span>}
                  <TerminalSquare className={`w-4 h-4 ${isActive ? "text-accent" : "text-zinc-600"}`} />
                  <span>{tab.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all p-0.5 rounded"><X className="w-3.5 h-3.5" /></button>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => createTab()}
              className="h-8 px-2 shrink-0 gap-1 text-xs font-bold text-accent hover:text-accent/80" title="New Terminal">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {activeTabId && (
              <div className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md border shrink-0"
                style={{ background: headerBg, borderColor: "var(--border)" }}>
                <StatusDot status={activeStatus} />
                <span className="text-zinc-500 font-mono hidden sm:inline">{statusLabel(activeStatus)}</span>
              </div>
            )}

            <div className="flex items-center gap-1 pl-1 border-l" style={{ borderColor: "var(--border)" }}>
              <Button variant="ghost" size="sm" onClick={() => { setRunCmd(""); setShowRunDialog(true); }} title="Run Command" className="h-9 w-9 p-0 text-green-400 hover:text-green-300"><Play className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={restartActive} title="Restart Terminal" className="h-9 w-9 p-0 text-yellow-400 hover:text-yellow-300"><RefreshCcw className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={stopActive} title="Stop (Ctrl+C)" className="h-9 w-9 p-0 text-red-400 hover:text-red-300"><Square className="w-4 h-4" /></Button>
            </div>
            <div className="flex items-center gap-1 pl-1 border-l" style={{ borderColor: "var(--border)" }}>
              <Button variant="ghost" size="sm" onClick={() => { setInstallCmd(""); setShowInstallDialog(true); }} title="Install Packages" className="h-9 w-9 p-0 text-cyan-400 hover:text-cyan-300"><Package className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={clearActive} title="Clear" className="h-9 w-9 p-0"><Trash2 className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={resetActive} title="Reset" className="h-9 w-9 p-0"><RotateCcw className="w-4 h-4" /></Button>
            </div>
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setShowQuickCmds(!showQuickCmds)}
                title="Quick Commands" className="h-8 px-2 text-xs text-cyan-400 hover:text-cyan-300">
                <TerminalIcon className="w-4 h-4" />
              </Button>
              {showQuickCmds && (
                <div className="absolute left-0 top-full mt-1 z-50 rounded-xl border shadow-2xl p-2 run-dropdown-enter min-w-[220px]"
                  style={{ background: headerBg, borderColor: "var(--border)" }}
                  onMouseLeave={() => setShowQuickCmds(false)}>
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">Quick Commands</div>
                  <div className="space-y-1">
                    {QUICK_CMDS.map((qc) => (
                      <button key={qc.label} onClick={() => handleQuickCmd(qc.cmd)}
                        className="quick-cmd-btn w-full flex items-center gap-2 text-left text-zinc-300 hover:text-white hover:bg-white/5"
                        style={{ borderColor: `${qc.color}30` }}>
                        <qc.icon className="w-3.5 h-3.5 shrink-0" style={{ color: qc.color }} />
                        <span className="font-mono text-[11px] truncate">{qc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 pl-1 border-l" style={{ borderColor: "var(--border)" }}>
              {!isMobile && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setFontSize((s) => Math.max(10, s - 1))} title="Decrease font" className="h-9 w-9 p-0"><ZoomOut className="w-4 h-4" /></Button>
                  <span className="text-xs font-mono text-zinc-500 w-5 text-center">{fontSize}</span>
                  <Button variant="ghost" size="sm" onClick={() => setFontSize((s) => Math.min(28, s + 1))} title="Increase font" className="h-9 w-9 p-0"><ZoomIn className="w-4 h-4" /></Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setFullscreen(!fullscreen)} title="Fullscreen" className="h-9 w-9 p-0">
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>

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

        {isMobile && (
          <div className="border-t shrink-0" style={{ background: headerBg, borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between px-2 py-1 border-b" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => setShowKb(!showKb)}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-white transition-colors py-1">
                <Keyboard className="w-3.5 h-3.5" />
                {showKb ? "Hide KB" : "Show KB"}
              </button>
              <span className="text-[9px] text-zinc-700 font-mono">{tabs.length} session(s)</span>
            </div>
            {showKb && (
              <div className="p-2 overflow-x-auto">
                <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-none pb-1">
                  {QUICK_CMDS.map((qc) => (
                    <button key={qc.label} onClick={() => handleQuickCmd(qc.cmd + "\r")}
                      className="quick-cmd-btn flex items-center gap-1 text-zinc-400 hover:text-white hover:bg-white/5"
                      style={{ borderColor: `${qc.color}30` }}>
                      <qc.icon className="w-3 h-3" style={{ color: qc.color }} />
                      <span className="text-[10px] font-mono">{qc.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {VIRTUAL_KEYS.map((key) => (
                    <button key={key.label} onClick={() => {
                      const { ws } = getRes(activeTabId!);
                      if (ws?.readyState === WebSocket.OPEN) {
                        let toSend = key.value;
                        if (key.isCtrl) {
                          toSend = "\x03";
                        }
                        ws.send(JSON.stringify({ type: "input", data: toSend }));
                      }
                    }}
                      className={`virt-kb-btn ${key.isCtrl ? "min-w-[52px]" : ""}`}>
                      {key.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2 justify-center flex-wrap">
                  <Button variant="ghost" size="sm" onClick={() => { setRunCmd(""); setShowRunDialog(true); }} className="h-8 px-3 text-[10px] text-green-400 hover:bg-white/5"><Play className="w-3 h-3 mr-1" />Run</Button>
                  <Button variant="ghost" size="sm" onClick={restartActive} className="h-8 px-3 text-[10px] text-yellow-400 hover:bg-white/5"><RefreshCcw className="w-3 h-3 mr-1" />Restart</Button>
                  <Button variant="ghost" size="sm" onClick={stopActive} className="h-8 px-3 text-[10px] text-red-400 hover:bg-white/5"><Square className="w-3 h-3 mr-1" />Stop</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setInstallCmd(""); setShowInstallDialog(true); }} className="h-8 px-3 text-[10px] text-cyan-400 hover:bg-white/5"><Package className="w-3 h-3 mr-1" />Install</Button>
                  <Button variant="ghost" size="sm" onClick={clearActive} className="h-8 px-3 text-[10px] text-zinc-400 hover:bg-white/5">Clear</Button>
                  <Button variant="ghost" size="sm" onClick={resetActive} className="h-8 px-3 text-[10px] text-zinc-400 hover:bg-white/5">Reset</Button>
                  <Button variant="ghost" size="sm" onClick={() => setFontSize((s) => Math.max(10, s - 1))} className="h-8 px-2 text-[10px] text-zinc-400 hover:bg-white/5">A-</Button>
                  <span className="text-[10px] font-mono text-zinc-600 flex items-center">{fontSize}</span>
                  <Button variant="ghost" size="sm" onClick={() => setFontSize((s) => Math.min(28, s + 1))} className="h-8 px-2 text-[10px] text-zinc-400 hover:bg-white/5">A+</Button>
                  <Button variant="ghost" size="sm" onClick={() => setFullscreen(!fullscreen)} className="h-8 px-2 text-[10px] text-zinc-400 hover:bg-white/5">
                    {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTabId && tabs.length > 0 && !isMobile && (
          <div className="flex items-center justify-between px-4 py-1.5 border-t shrink-0 text-xs font-mono"
            style={{ background: headerBg, borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 text-zinc-600">
              <StatusDot status={activeStatus} />
              <span>{statusLabel(activeStatus)}</span>
              {activeTab?.isolated && (
                <span className="flex items-center gap-1 text-green-500 ml-2">
                  <ShieldCheck className="w-3 h-3" /> Isolated
                </span>
              )}
            </div>
            <span className="text-zinc-700">{tabs.length} session(s)</span>
          </div>
        )}

        {showRunDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowRunDialog(false)}>
            <div className="rounded-2xl border w-full max-w-lg p-5 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Play className="w-4 h-4 text-green-400" /> Run Command</h3>
                <button onClick={() => setShowRunDialog(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2 mb-3">
                <input value={runCmd} onChange={(e) => setRunCmd(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRunCmd(); if (e.key === "Escape") setShowRunDialog(false); }}
                  placeholder="Type your command here..."
                  className="flex-1 h-10 px-3 text-xs font-mono rounded-lg border outline-none"
                  style={{ background: "var(--background)", borderColor: "rgba(139,92,246,0.3)", color: "var(--foreground)" }} autoFocus />
                <Button size="sm" onClick={handleRunCmd} className="bg-green-600 hover:bg-green-700 text-white h-10 px-4 text-xs font-bold" disabled={!runCmd.trim()}>
                  Execute
                </Button>
              </div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Quick Presets</div>
              <div className="flex flex-wrap gap-1.5">
                {RUN_PRESETS.map((preset) => (
                  <button key={preset.cmd} onClick={() => { setRunCmd(preset.cmd); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-mono border transition-all hover:text-white"
                    style={{ borderColor: `${preset.lang === "py" ? "#3776ab" : preset.lang === "js" ? "#cb3837" : preset.lang === "php" ? "#8892bf" : preset.lang === "go" ? "#00add8" : "#22c55e"}40`, color: "var(--foreground)" }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showInstallDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowInstallDialog(false)}>
            <div className="rounded-2xl border w-full max-w-lg p-5 shadow-2xl" style={{ background: "var(--card)", borderColor: "var(--border)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Package className="w-4 h-4 text-cyan-400" /> Install Packages</h3>
                <button onClick={() => setShowInstallDialog(false)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2 mb-3">
                <input value={installCmd} onChange={(e) => setInstallCmd(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleInstallCmd(); if (e.key === "Escape") setShowInstallDialog(false); }}
                  placeholder="Type install command here..."
                  className="flex-1 h-10 px-3 text-xs font-mono rounded-lg border outline-none"
                  style={{ background: "var(--background)", borderColor: "rgba(139,92,246,0.3)", color: "var(--foreground)" }} autoFocus />
                <Button size="sm" onClick={handleInstallCmd} className="bg-cyan-600 hover:bg-cyan-700 text-white h-10 px-4 text-xs font-bold" disabled={!installCmd.trim()}>
                  Install
                </Button>
              </div>
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Quick Presets</div>
              <div className="flex flex-wrap gap-1.5">
                {INSTALL_PRESETS.map((preset) => (
                  <button key={preset.cmd} onClick={() => { setInstallCmd(preset.cmd); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-mono border transition-all hover:text-white"
                    style={{ borderColor: `${preset.lang === "py" ? "#3776ab" : preset.lang === "js" ? "#cb3837" : preset.lang === "php" ? "#8892bf" : preset.lang === "go" ? "#00add8" : "#22c55e"}40`, color: "var(--foreground)" }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
