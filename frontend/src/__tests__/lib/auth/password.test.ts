import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("bcrypt でハッシュ化し、同じ平文だけ検証を通す", async () => {
    const hash = await hashPassword("dummy-pass-123");
    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyPassword("dummy-pass-123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-pass", hash)).resolves.toBe(false);
  });

  it("不正なハッシュ・空ハッシュは false（例外にしない）", async () => {
    await expect(verifyPassword("x", "not-a-bcrypt-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
    await expect(verifyPassword("x", null)).resolves.toBe(false);
  });
});
