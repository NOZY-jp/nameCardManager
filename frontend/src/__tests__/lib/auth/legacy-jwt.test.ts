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
  process.env.LEGACY_JWT_SECRET = undefined;
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

  it("Cookie と Authorization の両方から取り出す", () => {
    const cookie = new Headers({ cookie: "a=1; access_token=abc.def.ghi" });
    expect(readLegacyToken(cookie)).toBe("abc.def.ghi");
    const header = new Headers({ authorization: "Bearer xyz" });
    expect(readLegacyToken(header)).toBe("xyz");
    expect(readLegacyToken(new Headers())).toBeNull();
  });
});
