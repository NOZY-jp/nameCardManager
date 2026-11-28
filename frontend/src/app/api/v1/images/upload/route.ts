import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { putUpload } from "@/lib/images/uploads";
import { validationResponse } from "@/lib/namecards/http";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** POST /api/v1/images/upload（202 + upload_id）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  const form = await request.formData().catch(() => null);
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
    return NextResponse.json(
      { detail: "File too large. Maximum size is 20MB." },
      { status: 413 },
    );
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
