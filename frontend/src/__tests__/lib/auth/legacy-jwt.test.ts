// @vitest-environment node
import { createSecretKey } from "node:crypto";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { readLegacyToken, verifyLegacyJwt } from "@/lib/auth/legacy-jwt";

const SECRET = "dummy-legacy-secret-for-tests";
const SWITCH = "2026-12-01";

async function sign(expSecondsFromNow: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "dummy@example.test" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("42")
    .setExpirationTime(now + expSecondsFromNow)
    .sign(createSecretKey(Buffer.from(SECRET)));
}

afterEach(() => {
  process.env.LEGACY_JWT_SWITCH_DATE = undefined;
  delete process.env.SECRET_KEY;
  process.env.LEGACY_JWT_GRACE_DAYS = undefined;
});

describe("legacy JWT", () => {
  it("互換期間内（切替日から14日）は同一ユーザーとして受理する", async () => {
    const token = await sign(3600);
    const user = await verifyLegacyJwt(token, {
      now: new Date("2026-12-03T00:00:00Z"),
      secret: SECRET,
      switchDate: SWITCH,
    });
    expect(user).toEqual({ id: 42, email: "dummy@example.test" });
  });

  it("切替日前・期限後は受理しない", async () => {
    const token = await sign(3600);
    const before = await verifyLegacyJwt(token, {
      now: new Date("2026-11-30T00:00:00Z"),
      secret: SECRET,
      switchDate: SWITCH,
    });
    const after = await verifyLegacyJwt(token, {
      now: new Date("2026-12-20T00:00:00Z"),
      secret: SECRET,
      switchDate: SWITCH,
    });
    expect(before).toBeNull();
    expect(after).toBeNull();
  });

  it("切替日が未設定なら受理しない（既定は互換期間 未開始）", async () => {
    const token = await sign(3600);
    await expect(
      verifyLegacyJwt(token, {
        now: new Date("2026-12-03T00:00:00Z"),
        secret: SECRET,
      }),
    ).resolves.toBeNull();
  });

  it("署名が違うトークンは受理しない", async () => {
    const token = await sign(3600);
    await expect(
      verifyLegacyJwt(token, {
        now: new Date("2026-12-03T00:00:00Z"),
        secret: "different-secret",
        switchDate: SWITCH,
      }),
    ).resolves.toBeNull();
  });

  it("exp が無いトークンは拒否する", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ email: "dummy@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuedAt(now)
      .sign(createSecretKey(Buffer.from(SECRET)));
    await expect(
      verifyLegacyJwt(token, {
        now: new Date("2026-12-03T00:00:00Z"),
        secret: SECRET,
        switchDate: SWITCH,
      }),
    ).resolves.toBeNull();
  });

  it("alg が HS256 以外（none / HS512）は拒否する", async () => {
    const claims = { email: "dummy@example.test", exp: 2000000000 };
    const noneToken = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;
    const hs512 = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("42")
      .sign(createSecretKey(Buffer.from(SECRET)));
    for (const token of [noneToken, hs512]) {
      await expect(
        verifyLegacyJwt(token, {
          now: new Date("2026-12-03T00:00:00Z"),
          secret: SECRET,
          switchDate: SWITCH,
        }),
      ).resolves.toBeNull();
    }
  });

  it("sub が整数でない・email が文字列でないトークンは拒否する", async () => {
    const now = Math.floor(Date.now() / 1000);
    const badSub = await new SignJWT({ email: "dummy@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("abc")
      .setExpirationTime(now + 3600)
      .sign(createSecretKey(Buffer.from(SECRET)));
    const badEmail = await new SignJWT({ email: 123 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setExpirationTime(now + 3600)
      .sign(createSecretKey(Buffer.from(SECRET)));
    for (const token of [badSub, badEmail]) {
      await expect(
        verifyLegacyJwt(token, {
          now: new Date("2026-12-03T00:00:00Z"),
          secret: SECRET,
          switchDate: SWITCH,
        }),
      ).resolves.toBeNull();
    }
  });

  it("Cookie と Authorization の両方から取り出す", () => {
    const cookie = new Headers({ cookie: "a=1; access_token=abc.def.ghi" });
    expect(readLegacyToken(cookie)).toBe("abc.def.ghi");
    const header = new Headers({ authorization: "Bearer xyz" });
    expect(readLegacyToken(header)).toBe("xyz");
    expect(readLegacyToken(new Headers())).toBeNull();
  });
});
