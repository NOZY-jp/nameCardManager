import { describe, expect, it } from "vitest";
import {
  namecardCreateSchema,
  namecardUpdateSchema,
} from "@/lib/schemas/namecard";

describe("namecard schemas", () => {
  it("parses minimal create data", () => {
    const result = namecardCreateSchema.safeParse({
      first_name: "太郎",
      last_name: "田中",
    });

    expect(result.success).toBe(true);
  });

  it("parses full create data with all fields", () => {
    const result = namecardCreateSchema.safeParse({
      first_name: "太郎",
      last_name: "田中",
      first_name_kana: "タロウ",
      last_name_kana: "タナカ",
      company_name: "株式会社テスト",
      department: "営業部",
      position: "部長",
      memo: "重要な取引先",
      contact_methods: [{ type: "email", value: "tanaka@example.com" }],
      relationship_ids: [1],
      tag_ids: [1, 2],
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing first_name", () => {
    const result = namecardCreateSchema.safeParse({
      last_name: "田中",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing last_name", () => {
    const result = namecardCreateSchema.safeParse({
      first_name: "太郎",
    });

    expect(result.success).toBe(false);
  });

  it("parses partial update data", () => {
    const result = namecardUpdateSchema.safeParse({
      first_name: "次郎",
    });

    expect(result.success).toBe(true);
  });
});
