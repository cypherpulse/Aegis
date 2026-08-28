import { createHash, randomBytes } from "node:crypto";
import {
  ensureDevUser,
  getProtocol,
  getSessionUser,
  userHasProtocolAccess,
  type Database,
  type ProtocolRecord,
  type UserRecord,
} from "@aegis/database";
import type { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE = "aegis_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Typed HTTP error the route/service layer throws; mapped to the envelope. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function authRequired(): boolean {
  return process.env.AUTH_REQUIRED === "true";
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  // In production the web app and API may live on different sites (split
  // hosting), so the session cookie must be SameSite=None; Secure to be sent on
  // cross-site requests. Dev stays Lax over http.
  const crossSite = process.env.NODE_ENV === "production";
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  const crossSite = process.env.NODE_ENV === "production";
  reply.clearCookie(SESSION_COOKIE, {
    path: "/",
    ...(crossSite ? { sameSite: "none" as const, secure: true } : {}),
  });
}

/** The authenticated session user, or null. */
export async function sessionUser(
  db: Database,
  req: FastifyRequest,
): Promise<UserRecord | null> {
  // Prefer a Bearer token (works cross-site with no cookies), fall back to the
  // session cookie so same-origin / local dev keeps working.
  const auth = req.headers.authorization;
  const bearer =
    typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
  const sessionId = bearer || req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return null;
  return getSessionUser(db, sessionId);
}

/**
 * Resolve the acting user. With AUTH_REQUIRED off, falls back to a seeded dev
 * user so the console/demo work unauthenticated. With it on, returns null when
 * there is no valid session.
 */
export async function currentUser(
  db: Database,
  req: FastifyRequest,
): Promise<UserRecord | null> {
  const user = await sessionUser(db, req);
  if (user) return user;
  if (!authRequired()) return ensureDevUser(db);
  return null;
}

export async function requireUser(
  db: Database,
  req: FastifyRequest,
): Promise<UserRecord> {
  const user = await currentUser(db, req);
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return user;
}

/** Require the acting user to be a member of the protocol; returns both. */
export async function requireProtocolAccess(
  db: Database,
  req: FastifyRequest,
  protocolId: string,
): Promise<{ user: UserRecord; protocol: ProtocolRecord }> {
  const user = await requireUser(db, req);
  const protocol = await getProtocol(db, protocolId);
  if (!protocol) throw new AppError(404, "NOT_FOUND", "Protocol not found");
  const ok = await userHasProtocolAccess(db, user.id, protocolId);
  if (!ok) throw new AppError(403, "FORBIDDEN", "You do not have access to this protocol");
  return { user, protocol };
}

// ---- Integration keys ---------------------------------------------------

export function generateIntegrationKey(): {
  raw: string;
  prefix: string;
  hash: string;
} {
  const prefix = randomBytes(6).toString("hex"); // 12 chars
  const secret = randomBytes(24).toString("hex");
  const raw = `aegis_${prefix}_${secret}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

export function hashIntegrationKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function parseIntegrationKey(raw: string): { prefix: string } | null {
  const parts = raw.split("_");
  if (parts.length !== 3 || parts[0] !== "aegis") return null;
  return { prefix: parts[1]! };
}
