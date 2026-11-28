// @vitest-environment node
import { createSecretKey } from "node:crypto";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { readLegacyToken, verifyLegacyJwt } from "@/lib/auth/legacy-jwt";

const SECRET = "dummy-legacy-secret-for-tests";
const SWITCH = "2026-12-01";
const GRACE_DAYS = 14;
// 猶予窓の内側（切替日 + 2日）
const INSIDE = new Date("2026-12-03T00:00:00Z");

type TokenOptions = {
  expSeconds?: number | null;
  sub?: string;
  email?: unknown;
  alg?: "HS256" | "HS512" | "none";
};

async function buildToken(options: TokenOptions = {}): Promise<string> {
  const {
    expSeconds = 3600,
    sub = "42",
    email = "dummy@example.test",
    alg = "HS256",
  } = options;
  const nowSec = Math.floor(INSIDE.getTime() / 1000);
  const builder = new SignJWT({ email }).setProtectedHeader({ alg });

  if (alg === "none") {
    // alg:none の壊れたトークンを手で組み立てる（署名なし）
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ email, sub, exp: nowSec + (expSeconds ?? 3600) }),
    ).toString("base64url");
    return `${header}.${payload}.`;
  }

  if (sub) builder.setSubject(sub);
  builder.setIssuedAt(nowSec);
  if (expSeconds !== null) builder.setExpirationTime(nowSec + expSeconds);
  return builder.sign(createSecretKey(Buffer.from(SECRET)));
}

function verify(
  token: string,
  overrides: { now?: Date; secret?: string; switchDate?: string | null } = {},
) {
  return verifyLegacyJwt(token, {
    now: overrides.now ?? INSIDE,
    secret: overrides.secret ?? SECRET,
    switchDate:
      overrides.switchDate === undefined ? SWITCH : overrides.switchDate,
    graceDays: GRACE_DAYS,
  });
}

beforeEach(() => {
  // 環境変数に依存しない（各テストは options で明示する）
  delete process.env.LEGACY_JWT_SWITCH_DATE;
  delete process.env.LEGACY_JWT_GRACE_DAYS;
  delete process.env.SECRET_KEY;
});

describe("legacy JWT", () => {
  it("正当なトークンは互換期間内で受理される（positive control）", async () => {
    await expect(verify(await buildToken())).resolves.toEqual({
      id: 42,
      email: "dummy@example.test",
    });
  });

  it("切替日前は拒否する", async () => {
    const token = await buildToken();
    await expect(verify(token)).resolves.not.toBeNull();
    await expect(
      verify(token, { now: new Date("2026-11-30T00:00:00Z") }),
    ).resolves.toBeNull();
  });

  it("猶予期間の後は拒否する", async () => {
    const token = await buildToken();
    await expect(verify(token)).resolves.not.toBeNull();
    await expect(
      verify(token, { now: new Date("2026-12-20T00:00:00Z") }),
    ).resolves.toBeNull();
  });

  it("切替日が未設定なら受理しない（既定は互換期間 未開始）", async () => {
    const token = await buildToken();
    await expect(verify(token, { switchDate: null })).resolves.toBeNull();
    await expect(verify(token)).resolves.not.toBeNull();
  });

  it("署名が違うトークンは拒否する", async () => {
    const token = await buildToken();
    await expect(
      verify(token, { secret: "different-secret" }),
    ).resolves.toBeNull();
    await expect(verify(token)).resolves.not.toBeNull();
  });

  it("exp が無いトークンは拒否する", async () => {
    const token = await buildToken({ expSeconds: null });
    await expect(verify(token)).resolves.toBeNull();
    await expect(verify(await buildToken())).resolves.not.toBeNull();
  });

  it("期限切れのトークンは拒否する", async () => {
    const token = await buildToken({ expSeconds: -60 });
    await expect(verify(token)).resolves.toBeNull();
    await expect(verify(await buildToken())).resolves.not.toBeNull();
  });

  it("alg が HS256 以外（none / HS512）は拒否する", async () => {
    for (const alg of ["none", "HS512"] as const) {
      const token = await buildToken({ alg });
      await expect(verify(token)).resolves.toBeNull();
    }
    await expect(verify(await buildToken())).resolves.not.toBeNull();
  });

  it("sub が整数でない・email が文字列でないトークンは拒否する", async () => {
    for (const options of [{ sub: "abc" }, { email: 123 }] as const) {
      const token = await buildToken(options);
      await expect(verify(token)).resolves.toBeNull();
    }
    await expect(verify(await buildToken())).resolves.not.toBeNull();
  });

  it("Cookie と Authorization の両方から取り出す", () => {
    const cookie = new Headers({ cookie: "a=1; access_token=abc.def.ghi" });
    expect(readLegacyToken(cookie)).toBe("abc.def.ghi");
    const header = new Headers({ authorization: "Bearer xyz" });
    expect(readLegacyToken(header)).toBe("xyz");
    expect(readLegacyToken(new Headers())).toBeNull();
  });
});
