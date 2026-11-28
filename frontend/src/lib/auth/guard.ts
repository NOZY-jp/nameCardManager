/** 認証の判定を 1 箇所に集約する（未ログインは 401）。 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readLegacyToken, verifyLegacyJwt } from "@/lib/auth/legacy-jwt";

export type CurrentUser = { id: number; email: string };

export async function getCurrentUser(
  request?: Request,
): Promise<CurrentUser | null> {
  const session = await auth();
  const sessionId = session?.user?.id;
  if (sessionId) {
    return { id: Number(sessionId), email: session.user.email ?? "" };
  }
  if (request) {
    const token = readLegacyToken(request.headers);
    if (token) {
      return verifyLegacyJwt(token);
    }
  }
  return null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
}
