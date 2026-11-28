/**
 * 旧 FastAPI JWT（HS256, SECRET_KEY）の受け入れ層。
 *
 * Phase 6 の切替日から `LEGACY_JWT_GRACE_DAYS`（既定 14 日）だけ旧 JWT を受理する。
 * `LEGACY_JWT_SWITCH_DATE`（YYYY-MM-DD）が未設定なら「互換期間は未開始」として
 * 一切受理しない（現時点の既定）。期限後は null を返し、呼び出し側が 401 にする。
 */
import { createSecretKey } from "node:crypto";
import { jwtVerify } from "jose";

export type LegacyUser = { id: number; email: string };

export type LegacyOptions = {
  now?: Date;
  secret?: string | null;
  switchDate?: string | null;
  graceDays?: number;
};

const DEFAULT_GRACE_DAYS = 14;

export function legacyWindow(
  options: LegacyOptions = {},
): { start: number; end: number } | null {
  const switchDate =
    options.switchDate ?? process.env.LEGACY_JWT_SWITCH_DATE ?? null;
  if (!switchDate) return null;
  const start = Date.parse(`${switchDate}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const days =
    options.graceDays ??
    Number(process.env.LEGACY_JWT_GRACE_DAYS ?? DEFAULT_GRACE_DAYS);
  if (!Number.isFinite(days) || days <= 0) return null;
  return { start, end: start + days * 24 * 60 * 60 * 1000 };
}

export async function verifyLegacyJwt(
  token: string,
  options: LegacyOptions = {},
): Promise<LegacyUser | null> {
  const now = options.now ?? new Date();
  const window = legacyWindow(options);
  if (!window) return null;
  if (now.getTime() < window.start || now.getTime() > window.end) return null;

  const secret = options.secret ?? process.env.SECRET_KEY ?? "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      createSecretKey(Buffer.from(secret)),
      {
        algorithms: ["HS256"],
      },
    );
    const sub = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub) return null;
    const id = Number(sub);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { id, email };
  } catch {
    return null;
  }
}

/** `Cookie` / `Authorization` ヘッダーから旧 JWT を取り出す。 */
export function readLegacyToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim() || null;
  }
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "access_token") {
      return decodeURIComponent(rest.join("=")) || null;
    }
  }
  return null;
}
