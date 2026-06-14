import { Request, Response, NextFunction } from "express";

const CLOUDFLARE_IPS = new Set([
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
  "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
  "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]);

const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
  "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function ipInSubnet(ip: string, subnet: string): boolean {
  const [rangeStr, bitsStr] = subnet.split("/");
  const bits = parseInt(bitsStr, 10);
  const rangeParts = rangeStr.split(".").map(Number);
  const ipParts = ip.split(".").map(Number);
  if (rangeParts.length !== 4 || ipParts.length !== 4) return false;
  const rangeInt = ((rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3]) >>> 0;
  const ipInt = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function isCloudflareIP(ip: string): boolean {
  for (const cidr of CLOUDFLARE_IPS) {
    if (ipInSubnet(ip, cidr)) return true;
  }
  return false;
}

export function cloudflareMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cfRay = req.headers["cf-ray"];
  const cfIp = req.headers["cf-connecting-ip"];
  const cfCountry = req.headers["cf-ipcountry"];
  const cfVisitor = req.headers["cdn-loop"];

  const isBehindCloudflare = !!cfRay || !!cfVisitor;

  if (isBehindCloudflare) {
    if (cfIp && typeof cfIp === "string") {
      (req as any).realIp = cfIp;
    }
  }

  res.setHeader("X-Cloudflare-Proxied", isBehindCloudflare ? "true" : "false");

  next();
}

export function cloudflareCacheControl(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    const ext = req.path.split(".").pop()?.toLowerCase();
    const staticExts = new Set(["js", "css", "png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf", "eot"]);
    if (ext && staticExts.has(ext)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (ext === "html" || ext === "htm" || !ext) {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, must-revalidate");
    }
  }
  next();
}

export function cloudflareSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: https://integrate.api.nvidia.com",
    "img-src 'self' data: blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);

  next();
}
