// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: async () => null,
}));

import { getCurrentUser, unauthorized } from "@/lib/auth/guard";

afterEach(() => {
  delete process.env.LEGACY_JWT_SWITCH_DATE;
  delete process.env.SECRET_KEY;
});

describe("guard", () => {
  it("未ログインは null を返し、401 応答を作れる", async () => {
    await expect(
      getCurrentUser(new Request("http://localhost/api")),
    ).resolves.toBeNull();
    const response = unauthorized();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: "Not authenticated",
    });
  });

  it("互換期間内の旧JWT Cookie は同一ユーザーとして扱う", async () => {
    const [{ SignJWT }, { createSecretKey }] = await Promise.all([
      import("jose"),
      import("node:crypto"),
    ]);
    const secret = "dummy-secret";
    const token = await new SignJWT({ email: "dummy@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("7")
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(createSecretKey(Buffer.from(secret)));
    process.env.SECRET_KEY = secret;
    process.env.LEGACY_JWT_SWITCH_DATE = new Date().toISOString().slice(0, 10);

    const request = new Request("http://localhost/api", {
      headers: { cookie: `access_token=${token}` },
    });
    await expect(getCurrentUser(request)).resolves.toEqual({
      id: 7,
      email: "dummy@example.test",
    });
  });
});
