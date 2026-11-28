/** 認証 API の共通ヘルパー（既存 FastAPI の応答形に合わせる）。 */
import { NextResponse } from "next/server";
import type { UserRecord } from "@/lib/auth/users";

export type CredentialsBody = { email: string; password: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCredentials(body: unknown): CredentialsBody | null {
  if (typeof body !== "object" || body === null) return null;
  const email = (body as Record<string, unknown>).email;
  const password = (body as Record<string, unknown>).password;
  if (typeof email !== "string" || typeof password !== "string") return null;
  if (!EMAIL_PATTERN.test(email) || password.length === 0) return null;
  return { email: email.trim().toLowerCase(), password };
}

export function userResponse(user: UserRecord, status = 200): NextResponse {
  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
      created_at: user.createdAt.toISOString(),
    },
    { status },
  );
}

export function badRequest(detail: string): NextResponse {
  return NextResponse.json({ detail }, { status: 400 });
}
