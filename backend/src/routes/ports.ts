import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import { logger } from "../lib/logger";
import { authenticate, requireAdmin } from "../middleware/authenticate";
import { portManager } from "../lib/port-manager";

const router: IRouter = Router();

router.get("/ports", async (_req: Request, res: Response): Promise<void> => {
  try {
    const ports = portManager.getAllocations();
    res.json(ports);
  } catch (err) {
    logger.error({ err }, "Failed to list port allocations");
    res.status(500).json({ error: "Failed to list ports" });
  }
});

router.get("/ports/check", async (req: Request, res: Response): Promise<void> => {
  try {
    const port = parseInt(req.query.port as string, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      res.status(400).json({ error: "Invalid port number" });
      return;
    }
    const free = portManager.isPortFree(port);
    res.json({ port, free });
  } catch (err) {
    logger.error({ err }, "Failed to check port");
    res.status(500).json({ error: "Failed to check port" });
  }
});

router.post("/ports/free", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { port } = req.body;
    if (!port || isNaN(parseInt(port, 10))) {
      res.status(400).json({ success: false, message: "Port number required" });
      return;
    }
    const freed = portManager.ensurePortFree(parseInt(port, 10));
    res.json({ success: true, port: parseInt(port, 10), freed });
  } catch (err) {
    logger.error({ err }, "Failed to free port");
    res.status(500).json({ success: false, message: "Failed to free port" });
  }
});

router.post("/ports/release", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { port } = req.body;
    if (!port || isNaN(parseInt(port, 10))) {
      res.status(400).json({ success: false, message: "Port number required" });
      return;
    }
    portManager.releasePort(parseInt(port, 10));
    res.json({ success: true, message: `Port ${port} released` });
  } catch (err) {
    logger.error({ err }, "Failed to release port");
    res.status(500).json({ success: false, message: "Failed to release port" });
  }
});

router.get("/ports/find", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const startPort = parseInt((req.query.start as string) || "8000", 10);
    const port = portManager.findFreePort(startPort);
    if (port === 0) {
      res.status(503).json({ error: "No free port available" });
      return;
    }
    res.json({ port });
  } catch (err) {
    logger.error({ err }, "Failed to find free port");
    res.status(500).json({ error: "Failed to find free port" });
  }
});

router.post("/ports/cleanup", authenticate, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const freed = portManager.cleanup();
    res.json({ success: true, freed });
  } catch (err) {
    logger.error({ err }, "Failed to cleanup ports");
    res.status(500).json({ success: false, message: "Failed to cleanup ports" });
  }
});

export default router;
