import { randomBytes } from "node:crypto";
import { verifyWalletSignature, isValidAddress } from "@aegis/blockchain";
import {
  consumeNonce,
  createSession,
  deleteSession,
  setNonce,
  upsertGoogleUser,
  upsertWalletUser,
  type Database,
  type UserRecord,
} from "@aegis/database";
import { err, ok } from "@aegis/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  AppError,
  clearSessionCookie,
  currentUser,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  setSessionCookie,
} from "../auth.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

export function walletMessage(address: string, nonce: string): string {
  return `Aegis authentication\nAddress: ${address.toLowerCase()}\nNonce: ${nonce}`;
}

function userDto(user: UserRecord) {
  return {
    id: user.id,
    authProvider: user.authProvider,
    walletAddress: user.walletAddress,
    email: user.email,
    displayName: user.displayName,
  };
}

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Only allow returning to a localhost origin (dev) — prevents open redirects. */
/** Configured production origins (CORS_ORIGINS + APP_BASE_URL) for the redirect allowlist. */
function configuredOrigins(): Set<string> {
  const set = new Set<string>();
  for (const raw of process.env.CORS_ORIGINS?.split(",") ?? []) {
    const o = raw.trim();
    if (o) {
      try {
        set.add(new URL(o).origin);
      } catch {
        /* ignore */
      }
    }
  }
  const appBase = process.env.APP_BASE_URL?.trim();
  if (appBase) {
    try {
      set.add(new URL(appBase).origin);
    } catch {
      /* ignore */
    }
  }
  return set;
}

/**
 * Validate a post-login redirect origin against an allowlist (open-redirect
 * guard): localhost in dev, plus any origin configured via CORS_ORIGINS or
 * APP_BASE_URL. This is what lets Google login return to the deployed web app.
 */
function safeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
    if (configuredOrigins().has(url.origin)) return url.origin;
  } catch {
    /* invalid */
  }
  return null;
}

export function registerAuthRoutes(app: FastifyInstance, db: Database): void {
  const base = "/api/v1/auth";

  app.post<{ Body: { address: string } }>(
    `${base}/wallet/nonce`,
    { schema: { body: z.object({ address: z.string().min(1) }) } },
    async (req, reply) => {
      const address = req.body.address;
      if (!isValidAddress(address)) {
        reply.code(400).send(err("VALIDATION", "Invalid address"));
        return;
      }
      const nonce = randomBytes(16).toString("hex");
      await setNonce(db, address, nonce, NONCE_TTL_MS);
      reply.send(
        ok({ address: address.toLowerCase(), nonce, message: walletMessage(address, nonce) }),
      );
    },
  );

  app.post<{ Body: { address: string; signature: string } }>(
    `${base}/wallet/verify`,
    {
      schema: {
        body: z.object({ address: z.string().min(1), signature: z.string().min(1) }),
      },
    },
    async (req, reply) => {
      const { address, signature } = req.body;
      const nonce = await consumeNonce(db, address);
      if (!nonce) {
        reply.code(401).send(err("UNAUTHORIZED", "No pending nonce for this address"));
        return;
      }
      const valid = await verifyWalletSignature({
        address,
        message: walletMessage(address, nonce),
        signature,
      });
      if (!valid) {
        reply.code(401).send(err("UNAUTHORIZED", "Signature verification failed"));
        return;
      }
      const user = await upsertWalletUser(db, address);
      const session = await createSession(db, user.id, SESSION_TTL_MS);
      setSessionCookie(reply, session.id);
      // Also return the token so the client can use header auth (cross-site, no cookie).
      reply.send(ok({ user: userDto(user), token: session.id }));
    },
  );

  app.get(`${base}/config`, async (_req, reply) => {
    reply.send(ok({ google: googleConfig() !== null }));
  });

  app.get(`${base}/me`, async (req, reply) => {
    try {
      const user = await currentUser(db, req);
      reply.send(ok({ user: user ? userDto(user) : null }));
    } catch {
      // Auth resolution must never crash the app shell (e.g. transient DB outage).
      reply.send(ok({ user: null }));
    }
  });

  app.post(`${base}/logout`, async (req, reply) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (sessionId) await deleteSession(db, sessionId);
    clearSessionCookie(reply);
    reply.code(204).send();
  });

  // ---- Google OAuth (real, config-gated) ----
  app.get<{ Querystring: { redirect?: string } }>(`${base}/google`, async (req, reply) => {
    const cfg = googleConfig();
    if (!cfg) {
      reply
        .code(501)
        .send(err("NOT_CONFIGURED", "Google OAuth is not configured on this server"));
      return;
    }
    // Remember where to return the user (their web app's origin), CSRF nonce prefixed.
    const origin = safeOrigin(req.query.redirect);
    const nonce = randomBytes(8).toString("hex");
    const state = origin
      ? `${nonce}.${Buffer.from(origin).toString("base64url")}`
      : nonce;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    reply.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    `${base}/google/callback`,
    async (req, reply) => {
      const cfg = googleConfig();
      if (!cfg) {
        reply.code(501).send(err("NOT_CONFIGURED", "Google OAuth is not configured"));
        return;
      }
      const code = req.query.code;
      if (!code) {
        reply.code(400).send(err("VALIDATION", "Missing authorization code"));
        return;
      }
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            redirect_uri: cfg.redirectUri,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          // Surface Google's own reason (e.g. redirect_uri_mismatch, invalid_grant).
          const detail = await tokenRes.text().catch(() => "");
          req.log.error({ status: tokenRes.status, detail }, "Google token exchange failed");
          throw new AppError(
            401,
            "UNAUTHORIZED",
            `Token exchange failed: ${detail.slice(0, 300) || tokenRes.status}`,
          );
        }
        const token = (await tokenRes.json()) as { access_token?: string };
        if (!token.access_token) throw new AppError(401, "UNAUTHORIZED", "No access token");
        const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { authorization: `Bearer ${token.access_token}` },
        });
        const profile = (await profileRes.json()) as { email?: string; name?: string };
        if (!profile.email) throw new AppError(401, "UNAUTHORIZED", "No email on profile");
        const user = await upsertGoogleUser(db, {
          email: profile.email,
          ...(profile.name ? { displayName: profile.name } : {}),
        });
        const session = await createSession(db, user.id, SESSION_TTL_MS);
        setSessionCookie(reply, session.id);
        // Return the user to the origin they started from (from state), else APP_BASE_URL.
        let origin: string | null = null;
        const state = req.query.state;
        if (typeof state === "string" && state.includes(".")) {
          try {
            origin = safeOrigin(
              Buffer.from(state.slice(state.indexOf(".") + 1), "base64url").toString(),
            );
          } catch {
            origin = null;
          }
        }
        // Pass the session token back in the URL fragment (not sent to servers,
        // not logged) so the web app can store it and use header auth — no
        // cross-site cookie needed.
        const base = origin ? `${origin}/overview` : (process.env.APP_BASE_URL ?? null);
        if (base) reply.redirect(`${base}#token=${encodeURIComponent(session.id)}`);
        else reply.send(ok({ user: userDto(user), token: session.id }));
      } catch (e) {
        if (e instanceof AppError) throw e;
        // Non-AppError = a raw failure (network to Google, JSON parse, or a DB
        // write). Log the real cause so it is diagnosable, not just BAD_GATEWAY.
        req.log.error({ err: e }, "Google OAuth callback failed");
        reply
          .code(502)
          .send(
            err("BAD_GATEWAY", "Google OAuth exchange failed", {
              reason: e instanceof Error ? e.message : String(e),
            }),
          );
      }
    },
  );
}
