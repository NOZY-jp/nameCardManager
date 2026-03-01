import { describe, expect, it } from "vitest";
import { importSchema } from "@/lib/schemas/import";

describe("import schema", () => {
  it("parses valid import data", () => {
    const result = importSchema.safeParse({
      version: "1.0",
      relationships: [{ name: "建築士会" }],
      tags: [{ name: "取引先" }],
      namecards: [{ first_name: "太郎", last_name: "田中" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing version", () => {
    const result = importSchema.safeParse({
      relationships: [],
      tags: [],
      namecards: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts empty arrays", () => {
    const result = importSchema.safeParse({
      version: "1.0",
      relationships: [],
      tags: [],
      namecards: [],
    });

    expect(result.success).toBe(true);
  });
});
