/**
 * 認証 API（Next.js Route Handlers）の E2E。
 *
 * 前提: ローカルの隔離 PostgreSQL（`DATABASE_URL`）と `AUTH_SECRET` が設定されていること。
 * UI ではなく `/api/v1/auth/*` を直接叩き、Cookie 属性まで確認する。
 */
import { createSecretKey } from "node:crypto";
import { expect, test } from "@playwright/test";
import { jwtVerify } from "jose";

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

test.describe("認証 API", () => {
  test("未ログインの me は 401", async ({ request }) => {
    const response = await request.get("/api/v1/auth/me");
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      detail: "Not authenticated",
    });
  });

  test("登録 → ログイン → me → ログアウト", async ({ request }) => {
    const email = uniqueEmail();
    const password = "DummyPass123!";

    const registered = await request.post("/api/v1/auth/register", {
      data: { email, password },
    });
    expect(registered.status()).toBe(201);
    const user = await registered.json();
    expect(user.email).toBe(email);
    expect(typeof user.id).toBe("number");
    expect(typeof user.created_at).toBe("string");

    const duplicate = await request.post("/api/v1/auth/register", {
      data: { email, password },
    });
    expect(duplicate.status()).toBe(409);

    const wrongPassword = await request.post("/api/v1/auth/login", {
      data: { email, password: "wrong-password" },
    });
    expect(wrongPassword.status()).toBe(401);

    const login = await request.post("/api/v1/auth/login", {
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const token = await login.json();
    expect(token).toMatchObject({ token_type: "bearer" });
    expect(typeof token.access_token).toBe("string");

    // 本文トークンは旧 FastAPI 互換の HS256（SECRET_KEY）。Cookie のセッショントークンとは別物。
    const secret = process.env.SECRET_KEY;
    expect(secret).toBeTruthy();
    const { payload, protectedHeader } = await jwtVerify(
      token.access_token,
      createSecretKey(Buffer.from(secret as string)),
      { algorithms: ["HS256"] },
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe(String(user.id));
    expect(payload.email).toBe(email);
    const minutesLeft = Number(payload.exp) - Math.floor(Date.now() / 1000);
    expect(minutesLeft).toBeGreaterThan(55 * 60);
    expect(minutesLeft).toBeLessThanOrEqual(60 * 60);

    const cookieHeader = login.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toMatch(/SameSite=lax/i);
    expect(cookieHeader).toContain("Path=/");
    // ローカルは http のため Secure は付かない（本番は NODE_ENV=production で付与）
    expect(cookieHeader).not.toMatch(/;\s*Secure/i);

    const sessionCookie = /authjs\.session-token=([^;]+)/.exec(
      cookieHeader,
    )?.[1];
    expect(sessionCookie).toBeTruthy();
    expect(token.access_token).not.toBe(sessionCookie);

    const me = await request.get("/api/v1/auth/me");
    expect(me.status()).toBe(200);
    await expect(me.json()).resolves.toMatchObject({ id: user.id, email });

    const logout = await request.post("/api/v1/auth/logout");
    expect(logout.status()).toBe(204);

    const afterLogout = await request.get("/api/v1/auth/me");
    expect(afterLogout.status()).toBe(401);

    // Cookie を消した後でも、本文トークンを Bearer で送れば旧JWT経路で通る（互換期間中）
    const viaBearer = await request.get("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    expect(viaBearer.status()).toBe(200);
    await expect(viaBearer.json()).resolves.toMatchObject({
      id: user.id,
      email,
    });
  });
});
