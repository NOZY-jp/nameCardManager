import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { userResponse } from "@/lib/auth/http";
import { findUserById } from "@/lib/auth/users";

/** GET /api/v1/auth/me（セッション Cookie または旧 JWT を受け付ける）。 */
export async function GET(request: Request): Promise<NextResponse> {
  const current = await getCurrentUser(request);
  if (!current) return unauthorized();

  const user = await findUserById(current.id);
  if (!user) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }
  return userResponse(user);
}
