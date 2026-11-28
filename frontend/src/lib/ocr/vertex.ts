/**
 * Vertex AI OCR（既存 FastAPI の OCR_PROMPT / スキーマ / 正規化を踏襲）。
 *
 * - `OCR_PROVIDER=vertex` のときだけ外部呼び出しする。既定は `none`（呼ばない）。
 * - 鍵は `GOOGLE_APPLICATION_CREDENTIALS`（secrets/ のサービスアカウント）から。
 * - `OCR_STRICT_FAILURE=true` のとき失敗を例外にし、呼び出し側が 503 を返す。
 */
export const CONTACT_METHOD_TYPES = [
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

export type ContactMethodType = (typeof CONTACT_METHOD_TYPES)[number];

export type OcrResult = {
  first_name: string;
  last_name: string;
  first_name_kana: string | null;
  last_name_kana: string | null;
  company_name: string | null;
  department: string | null;
  position: string | null;
  memo: string | null;
  contact_methods: {
    type: ContactMethodType;
    value: string;
    is_primary: boolean;
  }[];
};

export const OCR_PROMPT = `この名刺画像から情報を JSON で抽出します。次の順で行ってください。
1. 画像の文字を一字一句そのまま書き写す（transcript）
2. transcript に実在する文字列だけを各項目に切り出す

項目: transcript, last_name, first_name, last_name_kana, first_name_kana,
company_name, department, position, memo, contact_methods({type, value, is_primary})

禁止事項（重要）:
- 画像に無い住所・社名・電話番号・メール・フリガナを作らない
- 読めない漢字を別の漢字に置き換えない（読めない項目は null）
- フリガナは画像に明記されている場合のみ入れる。推測しない
- 縦書きの場合は行ごとに読み、列の順に並べる

contact_methods の type は email, tel, mobile, fax, website, x, instagram, youtube,
discord, booth, github, linkedin, facebook, line, tiktok, address, other のいずれか。
is_primary は先頭の 1 件のみ true。
JSON のみを返してください。マークダウンコードブロックは不要です。`;

export const OCR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    first_name: { type: "string" },
    last_name: { type: "string" },
    first_name_kana: { type: "string", nullable: true },
    last_name_kana: { type: "string", nullable: true },
    company_name: { type: "string", nullable: true },
    department: { type: "string", nullable: true },
    position: { type: "string", nullable: true },
    memo: { type: "string", nullable: true },
    contact_methods: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: CONTACT_METHOD_TYPES },
          value: { type: "string" },
          is_primary: { type: "boolean" },
        },
        required: ["type", "value", "is_primary"],
      },
    },
  },
  required: ["first_name", "last_name", "contact_methods"],
} as const;

export class OcrError extends Error {}

export function emptyOcrResult(): OcrResult {
  return {
    first_name: "",
    last_name: "",
    first_name_kana: null,
    last_name_kana: null,
    company_name: null,
    department: null,
    position: null,
    memo: null,
    contact_methods: [],
  };
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** モデル出力を API の形に整える（型の丸め・is_primary の一本化）。 */
export function normalizeOcrResult(raw: Record<string, unknown>): OcrResult {
  const result = emptyOcrResult();
  result.first_name = clean(raw.first_name) ?? "";
  result.last_name = clean(raw.last_name) ?? "";
  for (const key of [
    "first_name_kana",
    "last_name_kana",
    "company_name",
    "department",
    "position",
    "memo",
  ] as const) {
    result[key] = clean(raw[key]);
  }
  const contacts = Array.isArray(raw.contact_methods)
    ? raw.contact_methods
    : [];
  const allowed = new Set<string>(CONTACT_METHOD_TYPES);
  for (const item of contacts) {
    if (typeof item !== "object" || item === null) continue;
    const value = clean((item as Record<string, unknown>).value);
    if (!value) continue;
    const rawType = (
      clean((item as Record<string, unknown>).type) ?? "other"
    ).toLowerCase();
    const type = (
      allowed.has(rawType) ? rawType : "other"
    ) as ContactMethodType;
    result.contact_methods.push({ type, value, is_primary: false });
  }
  if (result.contact_methods.length > 0) {
    result.contact_methods[0].is_primary = true;
  }
  return result;
}

/** コードフェンスや前後の説明が付いていても JSON を取り出す。 */
export function parseJsonResponse(text: string): Record<string, unknown> {
  let raw = (text ?? "").trim();
  if (!raw) throw new OcrError("OCR の応答が空です");
  if (raw.startsWith("```")) {
    raw = raw.slice(raw.indexOf("\n") + 1);
    if (raw.trimEnd().endsWith("```")) {
      raw = raw.trimEnd().slice(0, -3);
    }
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object")
      return parsed as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed && typeof parsed === "object")
        return parsed as Record<string, unknown>;
    }
    throw new OcrError("OCR の応答を JSON として解釈できません");
  }
  throw new OcrError("OCR の応答が JSON オブジェクトではありません");
}

function detectMimeType(imageBytes: Buffer): string {
  if (imageBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (
    imageBytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (imageBytes.subarray(0, 4).toString("ascii") === "RIFF")
    return "image/webp";
  return "image/jpeg";
}

type GenerateFn = (args: {
  imageBytes: Buffer;
  mimeType: string;
}) => Promise<string>;

async function vertexGenerate(args: {
  imageBytes: Buffer;
  mimeType: string;
}): Promise<string> {
  const project = process.env.VERTEX_PROJECT;
  if (!project) throw new OcrError("VERTEX_PROJECT が設定されていません");
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({
    vertexai: true,
    project,
    location: process.env.VERTEX_LOCATION ?? "global",
  });
  const response = await client.models.generateContent({
    model: process.env.VERTEX_MODEL ?? "gemini-3.1-flash-lite",
    contents: [
      {
        role: "user",
        parts: [
          { text: OCR_PROMPT },
          {
            inlineData: {
              mimeType: args.mimeType,
              data: args.imageBytes.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: OCR_RESPONSE_SCHEMA,
      temperature: 0,
    },
  });
  return response.text ?? "";
}

/** 画像から名刺項目を抽出する（テストでは generate を注入できる）。 */
export async function extractBusinessCard(
  imageBytes: Buffer,
  options: { generate?: GenerateFn } = {},
): Promise<OcrResult> {
  const provider = (process.env.OCR_PROVIDER ?? "none").toLowerCase();
  if (provider === "none") return emptyOcrResult();
  if (provider !== "vertex") {
    throw new OcrError(`未対応の OCR_PROVIDER です: ${provider}`);
  }
  const generate = options.generate ?? vertexGenerate;
  try {
    const text = await generate({
      imageBytes,
      mimeType: detectMimeType(imageBytes),
    });
    return normalizeOcrResult(parseJsonResponse(text));
  } catch (error) {
    if (process.env.OCR_STRICT_FAILURE === "true") {
      throw error instanceof OcrError ? error : new OcrError(String(error));
    }
    return emptyOcrResult();
  }
}
