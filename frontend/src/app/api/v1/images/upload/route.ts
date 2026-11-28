import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { putUpload } from "@/lib/images/uploads";
import { validationResponse } from "@/lib/namecards/http";

// nginx の client_max_body_size 10M に合わせる（20MB へ上げるにはサーバー設定の承認が必要）。
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function tooLarge(): NextResponse {
  return NextResponse.json(
    { detail: "File too large. Maximum size is 10MB." },
    { status: 413 },
  );
}

/** 読み取り中も上限を超えたら中断する（Content-Length が無い場合の保険）。 */
async function readBodyLimited(
  request: Request,
  limit: number,
): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** POST /api/v1/images/upload（202 + upload_id）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE) {
    return tooLarge();
  }
  const body = await readBodyLimited(request, MAX_FILE_SIZE);
  if (!body) return tooLarge();
  const contentTypeHeader = request.headers.get("content-type") ?? "";
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": contentTypeHeader },
    body: new Uint8Array(body),
  })
    .formData()
    .catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return validationResponse([
      { type: "missing", loc: ["body", "file"], msg: "file is required" },
    ]);
  }
  const contentType = file.type || "";
  if (!ALLOWED_TYPES.has(contentType)) {
    return validationResponse([
      {
        type: "value_error",
        loc: ["body", "file"],
        msg: `Unsupported file type: ${contentType}. Allowed: JPEG, PNG, WebP.`,
      },
    ]);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_FILE_SIZE) {
    return tooLarge();
  }
  try {
    await sharp(bytes).metadata();
  } catch {
    return validationResponse([
      {
        type: "value_error",
        loc: ["body", "file"],
        msg: "Invalid image file.",
      },
    ]);
  }

  const uploadId = putUpload(user.id, bytes);
  return NextResponse.json(
    {
      upload_id: uploadId,
      message: "Upload accepted. OCR processing started.",
    },
    { status: 202 },
  );
}
