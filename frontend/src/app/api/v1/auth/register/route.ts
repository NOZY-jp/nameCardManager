import { NextResponse } from "next/server";
import { badRequest, parseCredentials, userResponse } from "@/lib/auth/http";
import { hashPassword } from "@/lib/auth/password";
import { createUser, findUserByEmail } from "@/lib/auth/users";

/** POST /api/v1/auth/register（FastAPI 互換: 201 + UserResponse）。 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const credentials = parseCredentials(body);
  if (!credentials) {
    return badRequest("email and password are required");
  }

  const existing = await findUserByEmail(credentials.email);
  if (existing) {
    return NextResponse.json(
      { detail: "Email already registered" },
      { status: 409 },
    );
  }

  try {
    const user = await createUser(
      credentials.email,
      await hashPassword(credentials.password),
    );
    return userResponse(user, 201);
  } catch (error) {
    // 同時登録で一意制約に当たった場合も FastAPI と同じ 409 にする
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { detail: "Email already registered" },
        { status: 409 },
      );
    }
    throw error;
  }
}
