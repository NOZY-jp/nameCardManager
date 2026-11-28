// @vitest-environment node
import { createSecretKey } from "node:crypto";
import { jwtVerify } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  jwtExpireMinutes,
  MissingSecretError,
  signLegacyAccessToken,
} from "@/lib/auth/legacy-token";

const SECRET = "dummy-secret-key-for-tests";

afterEach(() => {
  delete process.env.SECRET_KEY;
  process.env.JWT_EXPIRE_MINUTES = undefined;
});

describe("legacy access token", () => {
  it("旧 FastAPI と同じ sub / email / exp（60分）で HS256 署名する", async () => {
    const now = new Date("2026-12-03T00:00:00Z");
    const token = await signLegacyAccessToken(
      { id: 42, email: "dummy@example.test" },
      { secret: SECRET, now },
    );
    const { payload, protectedHeader } = await jwtVerify(
      token,
      createSecretKey(Buffer.from(SECRET)),
      { algorithms: ["HS256"] },
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("42");
    expect(payload.email).toBe("dummy@example.test");
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 3600);
  });

  it("JWT_EXPIRE_MINUTES を反映する", async () => {
    const now = new Date("2026-12-03T00:00:00Z");
    const token = await signLegacyAccessToken(
      { id: 1, email: "dummy@example.test" },
      { secret: SECRET, now, expiresMinutes: 5 },
    );
    const { payload } = await jwtVerify(
      token,
      createSecretKey(Buffer.from(SECRET)),
    );
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 300);
    expect(jwtExpireMinutes("5")).toBe(5);
    expect(jwtExpireMinutes("abc")).toBe(60);
  });

  it("SECRET_KEY 未設定なら署名しない（MissingSecretError）", async () => {
    delete process.env.SECRET_KEY;
    await expect(
      signLegacyAccessToken({ id: 1, email: "dummy@example.test" }),
    ).rejects.toBeInstanceOf(MissingSecretError);
  });
});
