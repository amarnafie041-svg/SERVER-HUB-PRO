import { Request, Response, NextFunction } from "express";

const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 200;
const UPLOAD_MAX_REQUESTS = 50;

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const isUpload = req.path?.includes("/files/upload") || req.path?.includes("/files/delete") || req.path?.includes("/files/write");
  const maxReq = isUpload ? UPLOAD_MAX_REQUESTS : MAX_REQUESTS;
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let record = requestCounts.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + WINDOW_MS };
    requestCounts.set(key, record);
  }
  record.count++;
  res.setHeader("X-RateLimit-Limit", String(maxReq));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxReq - record.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));
  if (record.count > maxReq) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  next();
}

export function disableAuthBypassInProduction(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === "production" && process.env.DISABLE_AUTH === "true") {
    res.status(500).json({ error: "DISABLE_AUTH is not allowed in production" });
    return;
  }
  next();
}

// Periodically clean up stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts) {
    if (now > record.resetAt) requestCounts.delete(key);
  }
}, 60_000);
