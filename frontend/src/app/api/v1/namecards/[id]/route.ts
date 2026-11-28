import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { serviceError, validationError } from "@/lib/namecards/http";
import {
  deleteNameCard,
  getNameCard,
  updateNameCard,
} from "@/lib/namecards/service";
import { nameCardUpdateSchema, toPatchInput } from "@/lib/namecards/validation";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** GET /api/v1/namecards/{id} */
export async function GET(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const id = parseId((await params).id);
  if (id === null) return validationError("namecard id must be an integer");
  try {
    return NextResponse.json(await getNameCard(user.id, id));
  } catch (error) {
    return serviceError(error);
  }
}

/** PATCH /api/v1/namecards/{id} */
export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const id = parseId((await params).id);
  if (id === null) return validationError("namecard id must be an integer");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body");
  }
  const parsed = nameCardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { detail: parsed.error.issues.map((issue) => issue.message).join("; ") },
      { status: 422 },
    );
  }
  try {
    return NextResponse.json(
      await updateNameCard(user.id, id, toPatchInput(parsed.data)),
    );
  } catch (error) {
    return serviceError(error);
  }
}

/** DELETE /api/v1/namecards/{id} */
export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const id = parseId((await params).id);
  if (id === null) return validationError("namecard id must be an integer");
  try {
    await deleteNameCard(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return serviceError(error);
  }
}
