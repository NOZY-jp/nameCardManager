import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { serviceError, validationError } from "@/lib/namecards/http";
import { createNameCard, listNameCards } from "@/lib/namecards/service";
import {
  nameCardCreateSchema,
  toCreateInput,
} from "@/lib/namecards/validation";

function intParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

/** GET /api/v1/namecards（一覧・ページネーション・フィルタ）。 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const page = intParam(params.get("page"), 1);
  const perPage = intParam(params.get("per_page"), 20);
  if (Number.isNaN(page) || page < 1)
    return validationError("page must be >= 1");
  if (Number.isNaN(perPage) || perPage < 1) {
    return validationError("per_page must be >= 1");
  }
  const tagRaw = params.get("tag_id");
  const relRaw = params.get("relationship_id");
  const tagId = tagRaw === null ? undefined : Number(tagRaw);
  const relationshipId = relRaw === null ? undefined : Number(relRaw);
  if (tagId !== undefined && !Number.isInteger(tagId)) {
    return validationError("tag_id must be an integer");
  }
  if (relationshipId !== undefined && !Number.isInteger(relationshipId)) {
    return validationError("relationship_id must be an integer");
  }

  try {
    return NextResponse.json(
      await listNameCards(user.id, {
        page,
        perPage: Math.min(perPage, 100),
        sortBy: params.get("sort_by") ?? "updated_at",
        order: params.get("order") ?? "desc",
        tagId,
        relationshipId,
      }),
    );
  } catch (error) {
    return serviceError(error);
  }
}

/** POST /api/v1/namecards（作成）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body");
  }
  const parsed = nameCardCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { detail: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 422 },
    );
  }

  try {
    const created = await createNameCard(user.id, toCreateInput(parsed.data));
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return serviceError(error);
  }
}
