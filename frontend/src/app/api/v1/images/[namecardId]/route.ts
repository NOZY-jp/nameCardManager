import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { resolveImageFile } from "@/lib/images/paths";
import { placeholderWebp } from "@/lib/images/process";
import { serviceError, validationResponse } from "@/lib/namecards/http";
import { findNameCardImage } from "@/lib/namecards/service";

type Params = { params: Promise<{ namecardId: string }> };

function webpResponse(data: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "content-type": "image/webp" },
  });
}

/** GET /api/v1/images/{namecardId}?image_id=...（position=0 が既定）。 */
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
  const imageIdRaw = new URL(request.url).searchParams.get("image_id");
  const imageId = imageIdRaw === null ? undefined : Number(imageIdRaw);
  if (imageId !== undefined && !Number.isInteger(imageId)) {
    return validationResponse([
      {
        type: "int_parsing",
        loc: ["query", "image_id"],
        msg: "Input should be a valid integer",
      },
    ]);
  }
  try {
    const image = await findNameCardImage(user.id, Number(raw), imageId);
    if (!image) {
      return NextResponse.json({ detail: "Image not found" }, { status: 404 });
    }
    const file = resolveImageFile(image.imagePath);
    return webpResponse(file ? await readFile(file) : await placeholderWebp());
  } catch (error) {
    return serviceError(error);
  }
}
