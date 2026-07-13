import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { storage } from "../lib/storage";
import { logger } from "../lib/logger";
import { sandboxManager } from "../lib/sandbox-manager";
import { execSync, spawn } from "child_process";
import path from "path";

const router: IRouter = Router();

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

    const sandbox = sandboxManager.ensureUserSandbox(userId, username);
    const workDir = sandbox.homeDir;

    const runInDir = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
      return new Promise((resolve, reject) => {
        try {
          const out = execSync(cmd, {
            cwd: workDir,
            timeout: 120000,
            maxBuffer: 1024 * 1024,
            env: {
              ...process.env,
              HOME: workDir,
              SANDBOX_HOME: workDir,
              SANDBOX_ID: sandbox.id,
              TMPDIR: path.join(workDir, "tmp"),
              PATH: `${workDir}/bin:/usr/bin:/bin`,
            },
          });
          resolve({ stdout: out.stdout?.toString() || "", stderr: out.stderr?.toString() || "" });
        } catch (err: any) {
          resolve({
            stdout: err.stdout?.toString() || "",
            stderr: err.stderr?.toString() || err.message || "",
          });
        }
      });
    };

    let buildOutput = "";
    if (buildCmd.trim()) {
      const result = await runInDir(buildCmd.trim());
      buildOutput = result.stdout + result.stderr;
    }

    const startResult = await runInDir(runCmd.trim());

    res.json({
      success: true,
      build_output: buildOutput,
      start_output: startResult.stdout + startResult.stderr,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to run startup");
    res.status(500).json({ error: err.message || "Failed to run startup" });
  }
});

export default router;
