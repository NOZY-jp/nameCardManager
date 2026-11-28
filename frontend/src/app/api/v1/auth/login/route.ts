import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { badRequest, parseCredentials } from "@/lib/auth/http";
import {
  MissingSecretError,
  signLegacyAccessToken,
} from "@/lib/auth/legacy-token";
import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail } from "@/lib/auth/users";

/**
 * POST /api/v1/auth/login
 *
 * 既存 FastAPI と同じ `{ access_token, token_type }` を返しつつ、
 * セッションは httpOnly の JWT Cookie に保存する（移行期間の互換）。
 * `access_token` は旧 FastAPI と同じ HS256（`SECRET_KEY`）で、Cookie の
 * Auth.js セッショントークンとは別物。セッショントークンは本文に出さない。
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

  let accessToken: string;
  try {
    accessToken = await signLegacyAccessToken({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    if (error instanceof MissingSecretError) {
      return NextResponse.json(
        { detail: "SECRET_KEY is not set; cannot issue access token" },
        { status: 500 },
      );
    }
    throw error;
  }

  return NextResponse.json({ access_token: accessToken, token_type: "bearer" });
}
