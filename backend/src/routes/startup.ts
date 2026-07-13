import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { storage } from "../lib/storage";
import { logger } from "../lib/logger";
import { sandboxManager } from "../lib/sandbox-manager";
import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

interface RunningProcess {
  pid: number;
  cmd: string;
  startedAt: string;
  userId: string;
  username: string;
}

const runningProcesses = new Map<string, RunningProcess>();

router.get("/startup", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId || "";
    const user = storage.getUserById(userId);
    res.json({
      build_cmd: user?.build_cmd || "",
      run_cmd: user?.run_cmd || "",
    });
  } catch (err) {
    logger.error({ err }, "Failed to get startup config");
    res.status(500).json({ error: "Failed to get startup config" });
  }
});

router.put("/startup", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId || "";
    const { build_cmd, run_cmd } = req.body;
    const updates: any = {};
    if (build_cmd !== undefined) updates.build_cmd = String(build_cmd);
    if (run_cmd !== undefined) updates.run_cmd = String(run_cmd);
    const user = storage.updateUser(userId, updates);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ build_cmd: user.build_cmd || "", run_cmd: user.run_cmd || "" });
  } catch (err) {
    logger.error({ err }, "Failed to update startup config");
    res.status(500).json({ error: "Failed to update startup config" });
  }
});

function getWorkDir(userId: string, username: string): string {
  const sandbox = sandboxManager.ensureUserSandbox(userId, username);
  return sandbox.homeDir;
}

function buildRunEnv(workDir: string, sandbox: any): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    HOME: workDir,
    SANDBOX_HOME: workDir,
    SANDBOX_ID: sandbox.id,
    TMPDIR: path.join(workDir, "tmp"),
    PATH: `${workDir}/bin:/usr/bin:/bin`,
  };
}

router.post("/startup/run", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId || "";
    const username = (req as any).user?.username || "";
    const user = storage.getUserById(userId);
    const buildCmd = user?.build_cmd || "";
    const runCmd = user?.run_cmd || "";

    if (!runCmd.trim()) {
      res.status(400).json({ error: "No run command configured" });
      return;
    }

    // Kill any existing running process for this user
    const existing = runningProcesses.get(userId);
    if (existing) {
      try { process.kill(existing.pid, "SIGTERM"); } catch {}
      runningProcesses.delete(userId);
    }

    const sandbox = sandboxManager.ensureUserSandbox(userId, username);
    const workDir = sandbox.homeDir;
    const env = buildRunEnv(workDir, sandbox);

    let buildOutput = "";

    // Run build synchronously first (quick task)
    if (buildCmd.trim()) {
      try {
        const out = execSync(buildCmd.trim(), {
          cwd: workDir,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
          env,
        });
        buildOutput = (out.stdout?.toString() || "") + (out.stderr?.toString() || "");
      } catch (err: any) {
        buildOutput = (err.stdout?.toString() || "") + (err.stderr?.toString() || err.message || "");
      }
    }

    // Run start command as detached background process with nohup
    const logFile = path.join(workDir, "tmp", "startup.log");
    try { fs.mkdirSync(path.join(workDir, "tmp"), { recursive: true }); } catch {}

    const child = spawn("nohup", ["sh", "-c", runCmd.trim()], {
      cwd: workDir,
      env: { ...env, NOHUP: "1" },
      detached: true,
      stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")],
    });

    child.unref();

    const proc: RunningProcess = {
      pid: child.pid || 0,
      cmd: runCmd.trim(),
      startedAt: new Date().toISOString(),
      userId,
      username,
    };
    runningProcesses.set(userId, proc);

    logger.info({ pid: child.pid, username, cmd: runCmd.trim() }, "Startup process started (detached)");

    res.json({
      success: true,
      build_output: buildOutput,
      pid: child.pid,
      message: "Process started in background (will keep running until stopped)",
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to run startup");
    res.status(500).json({ error: err.message || "Failed to run startup" });
  }
});

router.post("/startup/stop", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId || "";
    const existing = runningProcesses.get(userId);
    if (!existing) {
      res.status(404).json({ error: "No running process for this user" });
      return;
    }
    try {
      process.kill(existing.pid, "SIGTERM");
      setTimeout(() => {
        try { process.kill(existing.pid, "SIGKILL"); } catch {}
      }, 5000);
    } catch {}
    runningProcesses.delete(userId);
    logger.info({ pid: existing.pid, username: existing.username }, "Process stopped");
    res.json({ success: true, message: "Process terminated" });
  } catch (err: any) {
    logger.error({ err }, "Failed to stop process");
    res.status(500).json({ error: err.message || "Failed to stop process" });
  }
});

router.get("/startup/status", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId || "";
    const isAdmin = (req as any).user?.role === "admin";
    const proc = runningProcesses.get(userId);
    if (!proc) {
      res.json({ running: false });
      return;
    }
    // Check if process is still alive
    let alive = true;
    try { process.kill(proc.pid, 0); } catch { alive = false; }
    if (!alive) {
      runningProcesses.delete(userId);
      res.json({ running: false });
      return;
    }
    res.json({
      running: true,
      pid: proc.pid,
      cmd: proc.cmd,
      startedAt: proc.startedAt,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to get startup status");
    res.status(500).json({ error: err.message || "Server error" });
  }
});

export default router;
