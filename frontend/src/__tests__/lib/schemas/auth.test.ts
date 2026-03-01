import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/lib/schemas/auth";

describe("auth schemas", () => {
  it("parses valid login data", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "securepass123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "pass",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("email"))).toBe(
        true,
      );
    }
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
    });

    expect(result.success).toBe(false);
  });

  it("parses valid register data", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "securepass123",
    });

    expect(result.success).toBe(true);
  });
});
