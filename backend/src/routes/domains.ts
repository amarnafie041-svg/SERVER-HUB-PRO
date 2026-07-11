import { Router, type IRouter } from "express";
import { Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { storage } from "../lib/storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/domains/info", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const username = (req as any).user?.username || "";
    const userId = (req as any).user?.userId || "";
    const baseDomain = process.env.BASE_DOMAIN || "server.app";
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.RAILWAY_STATIC_URL || `http://localhost:${process.env.PORT || 3001}`;

    const user = storage.getUserById(userId);
    const customSubdomain = user?.custom_subdomain || username;
    const customPort = user?.custom_port || parseInt(process.env.PORT || "3001");

    res.json({
      subdomain: `${customSubdomain}.${baseDomain}`,
      port: customPort,
      baseDomain,
      urls: {
        subdomain: `https://${customSubdomain}.${baseDomain}`,
        local: `http://localhost:${customPort}`,
        direct: `${baseUrl}/~${customSubdomain}`,
      },
      username: customSubdomain,
      userId,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get domain info");
    res.status(500).json({ error: "Failed to get domain info" });
  }
});

router.put("/domains/info", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId || "";
    const { custom_subdomain, custom_port } = req.body;

    const updates: any = {};

    if (custom_subdomain !== undefined) {
      const sub = String(custom_subdomain).toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(sub) && sub.length >= 2) {
        res.status(400).json({ error: "Subdomain must be 2+ chars, lowercase alphanumeric and hyphens only" });
        return;
      }
      if (sub.length > 0) {
        const existing = storage.getUserByUsername(sub);
        if (existing && existing.id !== userId) {
          res.status(400).json({ error: "Subdomain already taken" });
          return;
        }
      }
      updates.custom_subdomain = sub || null;
    }

    if (custom_port !== undefined) {
      const port = parseInt(custom_port);
      if (isNaN(port) || port < 1024 || port > 65535) {
        res.status(400).json({ error: "Port must be between 1024 and 65535" });
        return;
      }
      updates.custom_port = port;
    }

    const user = storage.updateUser(userId, updates);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      custom_subdomain: user.custom_subdomain,
      custom_port: user.custom_port,
    });
  } catch (err) {
    logger.error({ err }, "Failed to update domain info");
    res.status(500).json({ error: "Failed to update domain info" });
  }
});

router.get("/domains/list", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const isAdmin = (req as any).user?.role === "admin";
    if (!isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    res.json({ domains: [] });
  } catch (err) {
    logger.error({ err }, "Failed to list domains");
    res.status(500).json({ error: "Failed to list domains" });
  }
});

export default router;
