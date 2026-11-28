import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { correctAndSave } from "@/lib/images/process";
import { parseProcessBody } from "@/lib/images/process-body";
import { takeUpload } from "@/lib/images/uploads";

/** POST /api/v1/images/process-additional（四隅補正 + WebP 保存、OCR なし）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const body = parseProcessBody(await request.json().catch(() => null));
  if (body instanceof NextResponse) return body;

  const bytes = takeUpload(user.id, body.uploadId);
  if (!bytes) {
    return NextResponse.json({ detail: "Upload not found" }, { status: 404 });
  }
  try {
    const saved = await correctAndSave(bytes, body.corners);
    return NextResponse.json({
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
