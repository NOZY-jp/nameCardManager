import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import {
  serviceError,
  type ValidationIssue,
  validationResponse,
} from "@/lib/namecards/http";
import { addNameCardImage } from "@/lib/namecards/service";

type Params = { params: Promise<{ id: string }> };

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

/** POST /api/v1/namecards/{id}/images（201 + 画像レコード）。 */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const raw = (await params).id;
  if (!/^\d+$/.test(raw)) {
    return validationResponse([
      {
        type: "int_parsing",
        loc: ["path", "id"],
        msg: "Input should be a valid integer",
      },
    ]);
  }
  const parsed = parsePath(await request.json().catch(() => null));
  if (Array.isArray(parsed)) return validationResponse(parsed);

  try {
    const image = await addNameCardImage(user.id, Number(raw), parsed);
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    return serviceError(error);
  }
}
