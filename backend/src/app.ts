import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimiter, securityHeaders } from "./middleware/security";
import {
  cloudflareMiddleware,
  cloudflareCacheControl,
  cloudflareSecurityHeaders,
} from "./middleware/cloudflare";

const app: Express = express();

app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]);

app.use(compression({ level: 6, threshold: 256 }));
app.use(cloudflareMiddleware);
app.use(cloudflareSecurityHeaders);
app.use(securityHeaders);
app.use(cloudflareCacheControl);
app.use(rateLimiter);

app.use(pinoHttp({
  logger,
  serializers: {
    req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
}));

const corsOrigin = process.env.CORS_ORIGIN;
const cfDomain = process.env.CLOUDFLARE_DOMAIN;
let allowedOrigins: (string | boolean)[] = [];
if (corsOrigin) {
  allowedOrigins = corsOrigin.split(",").map(s => s.trim());
  allowedOrigins.push("http://localhost:5180");
  allowedOrigins.push("http://localhost:3001");
  if (cfDomain) allowedOrigins.push(cfDomain);
} else {
  allowedOrigins = [true];
}
app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-upload-path"],
  credentials: true,
}));

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

app.use("/api", router);

const frontendDist = path.join(process.cwd(), "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
      } else if (filePath.endsWith(".js")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      } else if (filePath.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }));

  app.use((req, res, next) => {
    try {
      if (!fs.existsSync(frontendDist)) return next();
      const p = req.path || "";
      if (p.startsWith("/api") || p.startsWith("/static") || p.startsWith("/assets")) return next();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.sendFile(path.join(frontendDist, "index.html"));
    } catch (err) {
      next();
    }
  });
}

export default app;
