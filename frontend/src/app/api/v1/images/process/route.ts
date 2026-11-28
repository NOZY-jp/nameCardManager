import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { correctAndSave } from "@/lib/images/process";
import { parseProcessBody } from "@/lib/images/process-body";
import { takeUpload } from "@/lib/images/uploads";
import {
  extractBusinessCard,
  OcrError,
  type OcrResult,
} from "@/lib/ocr/vertex";

/** POST /api/v1/images/process（OCR + 四隅補正 + WebP 保存）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const body = parseProcessBody(await request.json().catch(() => null));
  if (body instanceof NextResponse) return body;

  const bytes = takeUpload(user.id, body.uploadId);
  if (!bytes) {
    return NextResponse.json({ detail: "Upload not found" }, { status: 404 });
  }

  let ocrResult: OcrResult | null;
  try {
    ocrResult = await extractBusinessCard(bytes);
  } catch (error) {
    if (
      process.env.OCR_STRICT_FAILURE === "true" &&
      error instanceof OcrError
    ) {
      return NextResponse.json(
        {
          detail:
            "名刺の読み取りに失敗しました。時間をおいて再試行してください。",
        },
        { status: 503 },
      );
    }
    ocrResult = null;
  }
  if (!ocrResult) {
    return NextResponse.json(
      { detail: "OCR processing failed." },
      { status: 500 },
    );
  }

  try {
    const saved = await correctAndSave(bytes, body.corners);
    return NextResponse.json({
      ocr_result: ocrResult,
      image_path: saved.imagePath,
      thumbnail_path: saved.thumbnailPath,
    });
  } catch {
    return NextResponse.json(
      { detail: "Image processing failed." },
      { status: 422 },
    );
  }
}
