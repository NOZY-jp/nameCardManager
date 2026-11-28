import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { resolveThumbnailFile } from "@/lib/images/paths";
import { placeholderWebp, THUMBNAIL_SIZE } from "@/lib/images/process";
import { serviceError, validationResponse } from "@/lib/namecards/http";
import { findNameCardImage } from "@/lib/namecards/service";

type Params = { params: Promise<{ namecardId: string }> };

/** GET /api/v1/images/{namecardId}/thumbnail（position=0 のサムネイル）。 */
export async function GET(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const raw = (await params).namecardId;
  if (!/^\d+$/.test(raw)) {
    return validationResponse([
      {
        type: "int_parsing",
        loc: ["path", "namecard_id"],
        msg: "Input should be a valid integer",
      },
    ]);
  }
  try {
    const image = await findNameCardImage(user.id, Number(raw));
    if (!image) {
      return NextResponse.json({ detail: "Image not found" }, { status: 404 });
    }
    const file = resolveThumbnailFile(image.imagePath);
    const data = file
      ? await readFile(file)
      : await placeholderWebp(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: { "content-type": "image/webp" },
    });
  } catch (error) {
    return serviceError(error);
  }
}
