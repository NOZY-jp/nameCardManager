/** 名刺 API の共通エラー処理。 */
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth/guard";
import { ServiceError } from "@/lib/namecards/service";

export function serviceError(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json(
      { detail: error.detail },
      { status: error.status },
    );
  }
  throw error;
}

export function validationError(detail: string): NextResponse {
  return NextResponse.json({ detail }, { status: 422 });
}

export { unauthorized };
