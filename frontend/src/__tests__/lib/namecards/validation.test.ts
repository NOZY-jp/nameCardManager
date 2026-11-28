import { describe, expect, it } from "vitest";
import {
  nameCardCreateSchema,
  nameCardUpdateSchema,
  parseCommaIds,
  parseDate,
  toCreateInput,
  toPatchInput,
} from "@/lib/namecards/validation";

describe("namecard validation", () => {
  it("作成は last_name 必須で、既定値が FastAPI と一致する", () => {
    expect(nameCardCreateSchema.safeParse({}).success).toBe(false);
    const parsed = nameCardCreateSchema.parse({ last_name: "山田" });
    expect(parsed.first_name).toBe("");
    expect(parsed.contact_methods).toEqual([]);
    expect(parsed.relationship_ids).toEqual([]);
    expect(parsed.tag_ids).toEqual([]);
    const input = toCreateInput(parsed);
    expect(input.image_paths).toEqual([]);
    expect(input.first_name_kana).toBeNull();
  });

  it("連絡先の type は既存の列挙だけを受け付ける", () => {
    expect(
      nameCardCreateSchema.safeParse({
        last_name: "山田",
        contact_methods: [{ type: "email", value: "dummy@example.test" }],
      }).success,
    ).toBe(true);
    expect(
      nameCardCreateSchema.safeParse({
        last_name: "山田",
        contact_methods: [{ type: "unknown", value: "x" }],
      }).success,
    ).toBe(false);
  });

  it("PATCH は指定したフィールドだけを返す", () => {
    const parsed = nameCardUpdateSchema.parse({ memo: "更新", tag_ids: [2] });
    expect(toPatchInput(parsed)).toEqual({ memo: "更新", tag_ids: [2] });
    expect(toPatchInput(nameCardUpdateSchema.parse({}))).toEqual({});
  });

  it("カンマ区切り ID と日付を解釈する", () => {
    expect(parseCommaIds("1, 2,3")).toEqual([1, 2, 3]);
    expect(parseCommaIds("")).toEqual([]);
    expect(parseCommaIds("1,x")).toBeNull();
    expect(parseDate("2026-11-01T00:00:00Z")?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(parseDate("not-a-date")).toBeNull();
  });
});
