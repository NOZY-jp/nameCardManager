import { describe, expect, it } from "vitest";
import {
  buildSessionCookieOptions,
  sessionCookieName,
  sessionMaxAgeSeconds,
} from "@/lib/auth/config";

describe("session cookie", () => {
  it("httpOnly / sameSite=lax / path=/ で、本番だけ secure", () => {
    expect(buildSessionCookieOptions("production", 100)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 100,
    });
    expect(buildSessionCookieOptions("development", 100).secure).toBe(false);
    expect(sessionCookieName("production")).toBe(
      "__Secure-authjs.session-token",
    );
    expect(sessionCookieName("development")).toBe("authjs.session-token");
  });

  it("有効期限は日数から秒に変換し、不正値は30日に戻す", () => {
    expect(sessionMaxAgeSeconds("14")).toBe(14 * 86400);
    expect(sessionMaxAgeSeconds(undefined)).toBe(30 * 86400);
    expect(sessionMaxAgeSeconds("abc")).toBe(30 * 86400);
    expect(sessionMaxAgeSeconds("0")).toBe(30 * 86400);
  });
});
