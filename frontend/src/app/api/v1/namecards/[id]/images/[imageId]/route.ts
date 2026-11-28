import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { isStorableImagePath } from "@/lib/images/paths";
import {
  serviceError,
  type ValidationIssue,
  validationResponse,
} from "@/lib/namecards/http";
import {
  deleteNameCardImage,
  replaceNameCardImage,
} from "@/lib/namecards/service";

type Params = { params: Promise<{ id: string; imageId: string }> };

function parsePath(body: unknown): string | ValidationIssue[] {
  if (typeof body !== "object" || body === null) {
    return [{ type: "missing", loc: ["body"], msg: "body is required" }];
  }
  const value = (body as Record<string, unknown>).image_path;
  if (typeof value !== "string" || value.length === 0) {
    return [
      {
        type: "string_type",
        loc: ["body", "image_path"],
        msg: "image_path is required",
      },
    ];
  }
  return value;
}

/** PUT /api/v1/namecards/{id}/images/{imageId}（差し替え）。 */
export async function PUT(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id, imageId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(imageId)) {
    return validationResponse([
      {
        type: "int_parsing",
        loc: ["path"],
        msg: "Input should be a valid integer",
      },
    ]);
  }
  const parsed = parsePath(await request.json().catch(() => null));
  if (Array.isArray(parsed)) return validationResponse(parsed);
  if (!isStorableImagePath(parsed)) {
    return validationResponse([
      {
        type: "value_error",
        loc: ["body", "image_path"],
        msg: "image_path must be an existing file under IMAGE_DIR",
      },
    ]);
  }
  try {
    return NextResponse.json(
      await replaceNameCardImage(user.id, Number(id), Number(imageId), parsed),
    );
  } catch (error) {
    return serviceError(error);
  }
}

/** DELETE /api/v1/namecards/{id}/images/{imageId}（204、position 再計算）。 */
export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id, imageId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(imageId)) {
    return validationResponse([
      {
        type: "int_parsing",
        loc: ["path"],
        msg: "Input should be a valid integer",
      },
    ]);
  }
  try {
    await deleteNameCardImage(user.id, Number(id), Number(imageId));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceError(error);
  }
}
