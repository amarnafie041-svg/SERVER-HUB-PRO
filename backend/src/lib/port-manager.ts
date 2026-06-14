import { execSync } from "child_process";
import net from "net";
import os from "os";
import { logger } from "./logger";

const isWindows = os.platform() === "win32";

interface PortAllocation {
  port: number;
  userId: string;
  username: string;
  pid: number | null;
  cmd: string;
  startedAt: Date;
}

interface AppSession {
  id: string;
  userId: string;
  username: string;
  port: number;
  pid: number | null;
  cmd: string;
  status: "running" | "stopped" | "error";
  url: string;
  startCmd: string;
  startedAt: Date;
}

const allocations = new Map<number, PortAllocation>();
const sessions = new Map<string, AppSession>();
const PORT_RANGE = { start: 8000, end: 9000 };
const BLACKLIST_PORTS = new Set([3001, 5180, 5432, 6379, 27017]);

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
  } catch {
    return "";
  }
}

function isPortInUseNet(port: number): boolean {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

function isPortInUseSync(port: number): boolean {
  if (isWindows) {
    const out = safeExec(`netstat -ano -p TCP | findstr "LISTENING" | findstr ":${port}"`);
    return out.length > 0;
  }
  const out = safeExec(`lsof -i :${port} 2>/dev/null || ss -tlnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print}'`);
  return out.length > 0;
}

function killPidOnPort(port: number): boolean {
  if (isWindows) {
    const pidStr = safeExec(`netstat -ano -p TCP | findstr ":${port}" | findstr "LISTENING"`).split(/\s+/).pop() || "";
    const pid = parseInt(pidStr, 10);
    if (pid && pid > 0) {
      safeExec(`taskkill /PID ${pid} /F`);
      return true;
    }
    return false;
  }
  const pids = safeExec(`lsof -ti :${port} 2>/dev/null`).split("\n").filter(Boolean);
  if (pids.length > 0) {
    pids.forEach((pid) => safeExec(`kill -9 ${pid}`));
    return true;
  }
  return false;
}

function getPidOnPort(port: number): number | null {
  if (isWindows) {
    const out = safeExec(`netstat -ano -p TCP | findstr ":${port}" | findstr "LISTENING"`);
    const pidStr = out.split(/\s+/).pop() || "";
    const pid = parseInt(pidStr, 10);
    return pid && pid > 0 ? pid : null;
  }
  const out = safeExec(`lsof -ti :${port} 2>/dev/null`);
  const pid = parseInt(out.split("\n")[0], 10);
  return pid && pid > 0 ? pid : null;
}

function getProcessName(pid: number): string {
  if (isWindows) {
    const out = safeExec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
    const match = out.match(/"([^"]+)"/);
    return match ? match[1] : "unknown";
  }
  try {
    const content = require("fs").readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    return content || "unknown";
  } catch {
    return "unknown";
  }
}

export const portManager = {
  isPortFree(port: number): boolean {
    if (port < 1 || port > 65535) return false;
    if (BLACKLIST_PORTS.has(port)) return false;
    return !isPortInUseSync(port);
  },

  ensurePortFree(port: number): boolean {
    if (this.isPortFree(port)) return true;
    logger.info({ port }, "Port in use, attempting to free");
    killPidOnPort(port);
    allocations.delete(port);
    return this.isPortFree(port);
  },

  findFreePort(startPort = PORT_RANGE.start): number {
    for (let port = startPort; port <= PORT_RANGE.end; port++) {
      if (this.isPortFree(port)) return port;
    }
    for (let port = 1024; port <= 65535; port++) {
      if (!BLACKLIST_PORTS.has(port) && this.isPortFree(port)) return port;
    }
    return 0;
  },

  allocatePort(port: number, userId: string, username: string, cmd: string): PortAllocation | null {
    if (!this.ensurePortFree(port)) return null;
    const alloc: PortAllocation = { port, userId, username, pid: getPidOnPort(port), cmd, startedAt: new Date() };
    allocations.set(port, alloc);
    return alloc;
  },

  releasePort(port: number): boolean {
    killPidOnPort(port);
    allocations.delete(port);
    return true;
  },

  getAllocations(): PortAllocation[] {
    return Array.from(allocations.values());
  },

  getUserAllocations(userId: string): PortAllocation[] {
    return Array.from(allocations.values()).filter((a) => a.userId === userId);
  },

  startApp(userId: string, username: string, cmd: string, port: number, startCmd: string): AppSession {
    const id = generateId();
    const alloc = this.allocatePort(port, userId, username, cmd);
    const session: AppSession = {
      id,
      userId,
      username,
      port: alloc ? alloc.port : port,
      pid: alloc ? alloc.pid : null,
      cmd,
      status: alloc ? "running" : "error",
      url: `http://localhost:${port}`,
      startCmd,
      startedAt: new Date(),
    };
    sessions.set(id, session);
    return session;
  },

  stopApp(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    this.releasePort(session.port);
    session.status = "stopped";
    return true;
  },

  getSessions(userId?: string): AppSession[] {
    const all = Array.from(sessions.values());
    return userId ? all.filter((s) => s.userId === userId) : all;
  },

  cleanup(): number {
    let freed = 0;
    for (const [port, alloc] of allocations) {
      const pid = getPidOnPort(port);
      if (!pid || pid !== alloc.pid) {
        allocations.delete(port);
        freed++;
        continue;
      }
      try {
        if (isWindows) {
          safeExec(`taskkill /PID ${pid} /F`);
        } else {
          safeExec(`kill -0 ${pid} 2>/dev/null`);
          continue;
        }
      } catch {
        allocations.delete(port);
        freed++;
      }
    }
    for (const [id, session] of sessions) {
      if (session.status === "running") {
        const pid = getPidOnPort(session.port);
        if (!pid) {
          session.status = "stopped";
        }
      }
    }
    return freed;
  },

  getPublicUrl(port: number): string {
    const baseUrl = process.env.PUBLIC_URL || "";
    if (baseUrl) {
      return `${baseUrl}/proxy/${port}`;
    }
    return `http://localhost:${port}`;
  },
};

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startPortCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const freed = portManager.cleanup();
    if (freed > 0) {
      logger.info({ freed }, "Port cleanup freed stale allocations");
    }
  }, 30000);
}

export function stopPortCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
