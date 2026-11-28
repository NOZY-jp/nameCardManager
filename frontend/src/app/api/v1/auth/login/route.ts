import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { badRequest, parseCredentials } from "@/lib/auth/http";
import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail } from "@/lib/auth/users";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/**
 * POST /api/v1/auth/login
 *
 * 既存 FastAPI と同じ `{ access_token, token_type }` を返しつつ、
 * セッションは httpOnly の JWT Cookie に保存する（移行期間の互換）。
 */
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

  const user = await findUserByEmail(credentials.email);
  if (
    !user ||
    !(await verifyPassword(credentials.password, user.passwordHash))
  ) {
    return NextResponse.json(
      { detail: "Invalid email or password" },
      { status: 401 },
    );
  }

  await signIn("credentials", {
    email: credentials.email,
    password: credentials.password,
    redirect: false,
  });

  const cookieStore = await cookies();
  const sessionToken = SESSION_COOKIE_NAMES.map(
    (name) => cookieStore.get(name)?.value,
  ).find((value) => Boolean(value));

  return NextResponse.json({
    access_token: sessionToken ?? "",
    token_type: "bearer",
  });
}
