import jwt from "jsonwebtoken";
import crypto from "crypto";
import { logger } from "./logger";

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

if (!process.env.SESSION_SECRET) {
  logger.warn("SESSION_SECRET not set — using auto-generated random secret (sessions invalidate on restart)");
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: "admin" | "user";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
