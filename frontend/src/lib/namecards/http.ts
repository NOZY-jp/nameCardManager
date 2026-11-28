/** 名刺 API の共通エラー処理（FastAPI と同じ 422 配列形式）。 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { unauthorized } from "@/lib/auth/guard";
import { ServiceError } from "@/lib/namecards/service";

export type ValidationIssue = {
  type: string;
  loc: (string | number)[];
  msg: string;
};

/** FastAPI/Pydantic 風の 422（`detail` は配列）。 */
export function validationResponse(issues: ValidationIssue[]): NextResponse {
  return NextResponse.json({ detail: issues }, { status: 422 });
}

export function zodIssues(error: ZodError, prefix = "body"): ValidationIssue[] {
  return error.issues.map((issue) => ({
    type: issue.code,
    loc: [prefix, ...issue.path],
    msg: issue.message,
  }));
}

export function queryIssue(
  field: string,
  type: string,
  msg: string,
): ValidationIssue[] {
  return [{ type, loc: ["query", field], msg }];
}

export function serviceError(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json(
      { detail: error.detail },
      { status: error.status },
    );
  }
  throw error;
}

export { unauthorized };
