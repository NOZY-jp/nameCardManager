import { describe, expect, it } from "vitest";
import { relationshipCreateSchema } from "@/lib/schemas/relationship";

describe("relationship schema", () => {
  it("parses root node without parent_id", () => {
    const result = relationshipCreateSchema.safeParse({
      name: "建築士会",
    });

    expect(result.success).toBe(true);
  });

  it("parses child node with parent_id", () => {
    const result = relationshipCreateSchema.safeParse({
      name: "桑名支部",
      parent_id: 1,
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = relationshipCreateSchema.safeParse({
      name: "",
    });

    expect(result.success).toBe(false);
  });
});
