/** セッション Cookie の設定（テスト可能な純関数）。 */
export const DEFAULT_SESSION_MAX_AGE_DAYS = 30;

export function sessionMaxAgeSeconds(daysValue?: string | number): number {
  const days = Number(daysValue ?? DEFAULT_SESSION_MAX_AGE_DAYS);
  const safe =
    Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_MAX_AGE_DAYS;
  return safe * 24 * 60 * 60;
}

export type SessionCookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge: number;
};

export function buildSessionCookieOptions(
  nodeEnv: string | undefined,
  maxAge: number,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: nodeEnv === "production",
    maxAge,
  };
}

export function sessionCookieName(nodeEnv: string | undefined): string {
  return nodeEnv === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}
