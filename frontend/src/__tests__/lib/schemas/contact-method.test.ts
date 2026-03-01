import { describe, expect, it } from "vitest";
import { contactMethodSchema } from "@/lib/schemas/contact-method";

const ALL_CONTACT_TYPES = [
  "email",
  "tel",
  "mobile",
  "fax",
  "website",
  "x",
  "instagram",
  "youtube",
  "discord",
  "booth",
  "github",
  "linkedin",
  "facebook",
  "line",
  "tiktok",
  "address",
  "other",
] as const;

describe("contact-method schema", () => {
  it("parses valid contact method", () => {
    const result = contactMethodSchema.safeParse({
      type: "email",
      value: "a@b.com",
      is_primary: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = contactMethodSchema.safeParse({
      type: "invalid",
      value: "foo",
    });

    expect(result.success).toBe(false);
  });

  it("accepts all 17 contact method types", () => {
    for (const type of ALL_CONTACT_TYPES) {
      const result = contactMethodSchema.safeParse({
        type,
        value: `test-${type}`,
      });

      expect(result.success, `type "${type}" should be valid`).toBe(true);
    }
  });

  it("rejects missing value", () => {
    const result = contactMethodSchema.safeParse({
      type: "email",
    });

    expect(result.success).toBe(false);
  });
});
