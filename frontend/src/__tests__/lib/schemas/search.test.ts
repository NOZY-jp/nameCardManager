import { describe, expect, it } from "vitest";
import { searchQuerySchema } from "@/lib/schemas/search";

describe("search schema", () => {
  it("parses valid search query", () => {
    const result = searchQuerySchema.safeParse({
      q: "田中",
      page: 1,
      per_page: 20,
    });

    expect(result.success).toBe(true);
  });

  it("accepts empty query string", () => {
    const result = searchQuerySchema.safeParse({
      q: "",
    });

    expect(result.success).toBe(true);
  });

  it("parses query with filters", () => {
    const result = searchQuerySchema.safeParse({
      q: "田中",
      tag_ids: "1,2",
      relationship_ids: "3",
    });

    expect(result.success).toBe(true);
  });
});
