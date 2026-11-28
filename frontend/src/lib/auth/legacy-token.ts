/**
 * 旧 FastAPI 互換のアクセストークン（HS256）を発行する。
 *
 * - クレームは FastAPI と同じ `sub`（user id 文字列）/ `email` / `exp`（既定60分）。
 * - 署名鍵は旧 FastAPI と同じ `SECRET_KEY`。Auth.js の `AUTH_SECRET` とは別物。
 * - セッション Cookie（Auth.js）とは独立したトークンで、本文でのみ返す（移行期間の互換）。
 */
import { createSecretKey } from "node:crypto";
import { SignJWT } from "jose";

export const DEFAULT_JWT_EXPIRE_MINUTES = 60;

export class MissingSecretError extends Error {
  constructor() {
    super("SECRET_KEY is not set");
    this.name = "MissingSecretError";
  }
}

export type AccessTokenUser = { id: number; email: string };

export function jwtExpireMinutes(value?: string | number): number {
  const minutes = Number(
    value ?? process.env.JWT_EXPIRE_MINUTES ?? DEFAULT_JWT_EXPIRE_MINUTES,
  );
  return Number.isFinite(minutes) && minutes > 0
    ? minutes
    : DEFAULT_JWT_EXPIRE_MINUTES;
}

export async function signLegacyAccessToken(
  user: AccessTokenUser,
  options: { secret?: string | null; expiresMinutes?: number; now?: Date } = {},
): Promise<string> {
  const secret = options.secret ?? process.env.SECRET_KEY;
  if (!secret) throw new MissingSecretError();

  const now = options.now ?? new Date();
  const minutes = jwtExpireMinutes(options.expiresMinutes);
  const expiresAt = Math.floor(now.getTime() / 1000) + minutes * 60;

  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(expiresAt)
    .sign(createSecretKey(Buffer.from(secret)));
}
