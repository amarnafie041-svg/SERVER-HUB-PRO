import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import * as os from "os";
import { logger } from "../lib/logger";
import { authenticate, requireAdmin } from "../middleware/authenticate";
import { verifyToken } from "../lib/jwt";
import { logActivity } from "../routes/activity";
import { dockerManager } from "../lib/docker-manager";
import { sandboxManager } from "../lib/sandbox-manager";

export const terminalRouterAPI: IRouter = Router();

const MAX_BUFFER_LINES = 500;

interface TerminalSession {
  id: string;
  name: string;
  created_at: string;
  status: string;
  pty: any;
  dockerStream: any;
  sandboxProcess: any;
  sandboxId: string;
  sandboxHome: string;
  clients: Set<WebSocket>;
  commandBuffer: string;
  username: string;
  outputBuffer: string[];
  isolated: boolean;
}

const sessions = new Map<string, TerminalSession>();
const isWindows = os.platform() === "win32";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

let ptyModule: any = null;
try {
  ptyModule = require("node-pty");
} catch {
  logger.warn("node-pty not available, terminal will use fallback");
}

function getShell(): { shell: string; args: string[] } {
  if (isWindows) {
    const ps = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    try { if (require("fs").existsSync(ps)) return { shell: ps, args: ["-NoLogo", "-NoProfile"] }; } catch {}
    return { shell: "cmd.exe", args: [] };
  }
  const fs = require("fs");
  if (fs.existsSync("/usr/bin/zsh")) {
    return { shell: "/usr/bin/zsh", args: [] };
  }
  for (const s of ["/bin/bash", "/usr/bin/bash"]) {
    try { if (fs.existsSync(s)) return { shell: s, args: [] }; } catch {}
  }
  return { shell: "/bin/sh", args: [] };
}

function broadcastToClients(session: TerminalSession, msg: object) {
  const data = JSON.stringify(msg);
  for (const c of session.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  }
}

terminalRouterAPI.get("/terminal/sandbox-stats", authenticate, async (_req: Request, res: Response): Promise<void> => {
  res.json(sandboxManager.getStats());
});

terminalRouterAPI.get("/terminal/sandboxes", authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const sandboxes = sandboxManager.getAllUserSandboxes();
  res.json(sandboxes);
});

terminalRouterAPI.delete("/terminal/sandboxes/:userId", authenticate, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const userId = req.params.userId;
  sandboxManager.destroyUserSandbox(userId);
  res.json({ success: true, message: `Sandbox for user ${userId} destroyed` });
});

terminalRouterAPI.get("/terminal/sessions", authenticate, async (req: Request, res: Response): Promise<void> => {
  const currentUser = (req as any).user?.username || "";
  const isAdmin = (req as any).user?.role === "admin";
  const list = Array.from(sessions.values())
    .filter((s) => isAdmin || s.username === currentUser)
    .map((s) => ({
      id: s.id,
      name: s.name,
      created_at: s.created_at,
      status: s.status,
      isolated: s.isolated,
    }));
  res.json(list);
});

function assertSessionOwnership(req: Request, session: TerminalSession | undefined): { allowed: boolean; error?: { status: number; message: string } } {
  if (!session) return { allowed: false, error: { status: 404, message: "Session not found" } };
  const currentUser = (req as any).user?.username || "";
  const isAdmin = (req as any).user?.role === "admin";
  if (!isAdmin && session.username !== currentUser) {
    return { allowed: false, error: { status: 403, message: "Forbidden — not your session" } };
  }
  return { allowed: true };
}

terminalRouterAPI.get("/terminal/sessions/:id/alive", authenticate, async (req: Request, res: Response): Promise<void> => {
  const session = sessions.get(req.params.id);
  const ownership = assertSessionOwnership(req, session);
  if (!ownership.allowed) {
    const e = ownership.error!;
    res.status(e.status).json({ alive: false, message: e.message });
    return;
  }
  if (session!.status === "exited") {
    res.json({ alive: false });
    return;
  }
  try {
    const alive = session!.pty && !(session!.pty as any)._closed;
    res.json({ alive: !!alive });
  } catch {
    res.json({ alive: false });
  }
});

terminalRouterAPI.post("/terminal/sessions", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { name = "Terminal", cwd } = req.body;
  const id = generateId();
  const username = (req as any).user?.username || "unknown";
  const userId = (req as any).user?.userId || "";

  const session: TerminalSession = {
    id,
    name: name || "Terminal",
    created_at: new Date().toISOString(),
    status: "running",
    pty: null,
    dockerStream: null,
    sandboxProcess: null,
    sandboxId: "",
    sandboxHome: "",
    clients: new Set(),
    commandBuffer: "",
    username,
    outputBuffer: [],
    isolated: false,
  };

  let workDir = cwd || (isWindows
    ? process.env.USERPROFILE || "C:\\"
    : "/home/runner");

  if (dockerManager.isAvailable) {
    try {
      const containerId = await dockerManager.ensureContainer(username, userId);
      if (containerId) {
        session.isolated = true;
        logger.info({ id, username, containerId }, "Starting isolated terminal session");

        const { shell, args } = getShell();
        const execResult = await dockerManager.createExecStream(username, [shell, ...args], {
          Cwd: workDir,
          cols: 80,
          rows: 24,
        });

        if (execResult.stream) {
          session.dockerStream = execResult.stream;

          execResult.stream.on("data", (data: Buffer) => {
            const str = data.toString("utf8");
            session.outputBuffer.push(str);
            if (session.outputBuffer.length > MAX_BUFFER_LINES) {
              session.outputBuffer.splice(0, session.outputBuffer.length - MAX_BUFFER_LINES);
            }
            broadcastToClients(session, { type: "output", data: str });
          });

          execResult.stream.on("end", () => {
            session.status = "exited";
            broadcastToClients(session, { type: "exit" });
          });

          execResult.stream.on("error", () => {
            session.status = "exited";
            broadcastToClients(session, { type: "exit" });
          });

          logActivity({
            user: username,
            action: "terminal.create",
            target: `session/${id}`,
            details: `Isolated terminal session "${name}" created (Docker)`,
            status: "success",
          });

          logger.info({ id, username, isolated: true }, "Isolated terminal session created (Docker)");
          sessions.set(id, session);
          res.status(201).json({
            id,
            name: session.name,
            created_at: session.created_at,
            status: session.status,
            isolated: true,
          });
          return;
        }
      }
    } catch (err) {
      logger.warn({ err }, "Docker isolation failed, trying sandbox");
    }
  }

  const { id: sandboxId, homeDir } = sandboxManager.ensureUserSandbox(userId);
  session.sandboxId = sandboxId;
  session.sandboxHome = homeDir;
  workDir = homeDir;
  session.isolated = true;

  if (!ptyModule) {
    res.status(500).json({ error: "Terminal not available" });
    return;
  }

  try {
    const { shell, args } = getShell();
    const ptyProcess = ptyModule.spawn(shell, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        HOME: homeDir,
        TMPDIR: homeDir + "/tmp",
        TMP: homeDir + "/tmp",
        TEMP: homeDir + "/tmp",
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        SANDBOX_HOME: homeDir,
        SANDBOX_ID: sandboxId,
      },
    });

    session.pty = ptyProcess;

    ptyProcess.onData((data: string) => {
      session.outputBuffer.push(data);
      if (session.outputBuffer.length > MAX_BUFFER_LINES) {
        session.outputBuffer.splice(0, session.outputBuffer.length - MAX_BUFFER_LINES);
      }
      broadcastToClients(session, { type: "output", data });
    });

    ptyProcess.onExit(() => {
      session.status = "exited";
      broadcastToClients(session, { type: "exit" });
    });

    logActivity({
      user: username,
      action: "terminal.create",
      target: `session/${id}`,
      details: `Terminal session "${name}" created (Sandbox)`,
      status: "success",
    });
    logger.info({ id, homeDir, isolated: true }, "Terminal session created (Sandbox)");
    sessions.set(id, session);
    res.status(201).json({
      id,
      name: session.name,
      created_at: session.created_at,
      status: session.status,
      isolated: true,
    });
  } catch (err) {
    logger.error({ err }, "Sandbox terminal failed");
    res.status(500).json({ error: "Failed to create terminal session" });
  }
});

terminalRouterAPI.delete(
  "/terminal/sessions/:id",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const rawId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const session = sessions.get(rawId);
    if (!session) {
      res.status(404).json({ success: false, message: "Session not found" });
      return;
    }
    const currentUser = (req as any).user?.username || "";
    const isAdmin = (req as any).user?.role === "admin";
    if (!isAdmin && session.username !== currentUser) {
      res.status(403).json({ success: false, message: "Forbidden — not your session" });
      return;
    }
    try {
      if (session.dockerStream) {
        try { session.dockerStream.end(); } catch {}
      }
      if (session.pty) session.pty.kill();
      if (session.sandboxProcess) {
        try { session.sandboxProcess.kill("SIGKILL"); } catch {}
      }
      session.clients.forEach((c) => {
        if (c.readyState === WebSocket.OPEN) {
          c.send(JSON.stringify({ type: "exit" }));
          c.close();
        }
      });
      logActivity({
        user: session.username,
        action: "terminal.close",
        target: `session/${rawId}`,
        details: `Terminal session "${session.name}" closed`,
        status: "info",
      });
      sessions.delete(rawId);
      res.json({ success: true, message: "Session killed" });
    } catch (err) {
      logger.error({ err }, "Failed to kill session");
      res.status(500).json({ success: false, message: "Failed to kill session" });
    }
  }
);

export function setupTerminalWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url || "";
    const match = url.match(/\/api\/terminal\/ws\/([^/?]+)/);
    if (!match) {
      ws.close();
      return;
    }

    const sessionId = match[1];
    const session = sessions.get(sessionId);
    if (!session) {
      ws.close(1000, "Session not found");
      return;
    }
    if (session.status === "exited") {
      ws.close(1000, "Session exited");
      return;
    }

    session.clients.add(ws);

    if (session.outputBuffer.length > 0) {
      for (const chunk of session.outputBuffer) {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "output", data: chunk }));
      }
    }

    ws.on("message", (rawMsg: Buffer) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (msg.type === "input" && msg.data) {
          if (session.dockerStream) {
            session.dockerStream.write(msg.data);
          } else if (session.pty) {
            session.pty.write(msg.data);
          } else if (session.sandboxProcess) {
            sandboxManager.writeToShell(session.sandboxId, msg.data);
          }
          for (const ch of msg.data) {
            if (ch === "\r" || ch === "\n") {
              const cmd = session.commandBuffer.trim();
              if (cmd.length > 0) {
                logActivity({
                  user: session.username,
                  action: "terminal.command",
                  target: `session/${sessionId}`,
                  details: cmd,
                  status: "info",
                });
              }
              session.commandBuffer = "";
            } else if (ch === "\x7f" || ch === "\b") {
              session.commandBuffer = session.commandBuffer.slice(0, -1);
            } else if (ch >= " ") {
              session.commandBuffer += ch;
            }
          }
        } else if (msg.type === "resize" && msg.cols && msg.rows) {
          if (session.pty && typeof session.pty.resize === "function") {
            try { session.pty.resize(msg.cols, msg.rows); } catch {}
          }
        } else if (msg.type === "ping") {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (err) {
        logger.warn({ err }, "Failed to parse terminal message");
      }
    });

    ws.on("close", () => {
      session.clients.delete(ws);
    });

    ws.on("error", () => {
      session.clients.delete(ws);
    });
  });
}

export default terminalRouterAPI;
