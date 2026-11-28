import { afterEach, describe, expect, it } from "vitest";
import {
  emptyOcrResult,
  extractBusinessCard,
  normalizeOcrResult,
  parseJsonResponse,
} from "@/lib/ocr/vertex";

const original = { ...process.env };
afterEach(() => {
  process.env.OCR_PROVIDER = original.OCR_PROVIDER;
  process.env.OCR_STRICT_FAILURE = original.OCR_STRICT_FAILURE;
});

describe("vertex OCR", () => {
  it("出力を正規化し、未知の type は other・is_primary は先頭のみ", () => {
    const result = normalizeOcrResult({
      first_name: " 太郎 ",
      last_name: "山田",
      contact_methods: [
        { type: "email", value: " dummy@example.test ", is_primary: false },
        { type: "unknown", value: "x", is_primary: true },
      ],
    });
    expect(result.first_name).toBe("太郎");
    expect(result.company_name).toBeNull();
    expect(result.contact_methods).toEqual([
      { type: "email", value: "dummy@example.test", is_primary: true },
      { type: "other", value: "x", is_primary: false },
    ]);
  });

  it("コードフェンス付き JSON を読む", () => {
    expect(parseJsonResponse('```json\n{"last_name":"山田"}\n```')).toEqual({
      last_name: "山田",
    });
    expect(() => parseJsonResponse("")).toThrow();
  });

  it("OCR_PROVIDER=none は外部を呼ばず空結果", async () => {
    process.env.OCR_PROVIDER = "none";
    let called = false;
    const result = await extractBusinessCard(Buffer.from("x"), {
      generate: async () => {
        called = true;
        return "{}";
      },
    });
    expect(result).toEqual(emptyOcrResult());
    expect(called).toBe(false);
  });

  it("vertex は注入した generate の結果を返し、失敗時は既定で空結果", async () => {
    process.env.OCR_PROVIDER = "vertex";
    process.env.OCR_STRICT_FAILURE = "false";
    const ok = await extractBusinessCard(Buffer.from("x"), {
      generate: async () =>
        '{"last_name":"山田","first_name":"太郎","contact_methods":[]}',
    });
    expect(ok.last_name).toBe("山田");

    const failed = await extractBusinessCard(Buffer.from("x"), {
      generate: async () => {
        throw new Error("boom");
      },
    });
    expect(failed).toEqual(emptyOcrResult());
  });

  it("OCR_STRICT_FAILURE=true は例外にする", async () => {
    process.env.OCR_PROVIDER = "vertex";
    process.env.OCR_STRICT_FAILURE = "true";
    await expect(
      extractBusinessCard(Buffer.from("x"), {
        generate: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow();
  });
});
