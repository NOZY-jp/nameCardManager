import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import {
  queryIssue,
  serviceError,
  validationResponse,
} from "@/lib/namecards/http";
import { searchNameCards } from "@/lib/namecards/service";
import { parseCommaIds, parseDate } from "@/lib/namecards/validation";

function intParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

/** GET /api/v1/search（pg_bigm の =% 演算子で横断検索）。 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const page = intParam(params.get("page"), 1);
  const perPage = intParam(params.get("per_page"), 20);
  if (Number.isNaN(page) || page < 1) {
    return validationResponse(
      queryIssue(
        "page",
        "greater_than_equal",
        "Input should be greater than or equal to 1",
      ),
    );
  }
  if (Number.isNaN(perPage) || perPage < 1 || perPage > 100) {
    return validationResponse(
      queryIssue(
        "per_page",
        "less_than_equal",
        "Input should be between 1 and 100",
      ),
    );
  }
  const tagIds = parseCommaIds(params.get("tag_ids"));
  const relationshipIds = parseCommaIds(params.get("relationship_ids"));
  if (tagIds === null) {
    return validationResponse(
      queryIssue("tag_ids", "int_parsing", "Invalid ID value"),
    );
  }
  if (relationshipIds === null) {
    return validationResponse(
      queryIssue("relationship_ids", "int_parsing", "Invalid ID value"),
    );
  }

  try {
    const result = await searchNameCards(user.id, {
      q: params.get("q") ?? undefined,
      tagIds,
      relationshipIds,
      createdAtStart: parseDate(params.get("created_at_start")) ?? undefined,
      createdAtEnd: parseDate(params.get("created_at_end")) ?? undefined,
      updatedAtStart: parseDate(params.get("updated_at_start")) ?? undefined,
      updatedAtEnd: parseDate(params.get("updated_at_end")) ?? undefined,
      page,
      perPage,
      sortBy: params.get("sort_by") ?? "updated_at",
      order: params.get("order") ?? "desc",
    });
    return NextResponse.json(result);
  } catch (error) {
    return serviceError(error);
  }
}
