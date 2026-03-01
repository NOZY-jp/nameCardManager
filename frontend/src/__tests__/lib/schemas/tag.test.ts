import { describe, expect, it } from "vitest";
import { tagCreateSchema } from "@/lib/schemas/tag";

describe("tag schema", () => {
  it("parses valid tag", () => {
    const result = tagCreateSchema.safeParse({
      name: "取引先",
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = tagCreateSchema.safeParse({
      name: "",
    });

    expect(result.success).toBe(false);
  });
});
