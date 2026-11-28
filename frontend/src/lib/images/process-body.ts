/** 画像処理リクエスト（upload_id + 四隅）の検証。 */

import type { NextResponse } from "next/server";
import { type ValidationIssue, validationResponse } from "@/lib/namecards/http";

export type ProcessBody = {
  uploadId: string;
  corners: { x: number; y: number }[];
};

export function parseProcessBody(body: unknown): ProcessBody | NextResponse {
  if (typeof body !== "object" || body === null) {
    return validationResponse([
      { type: "missing", loc: ["body"], msg: "body is required" },
    ]);
  }
  const record = body as Record<string, unknown>;
  const uploadId = record.upload_id;
  const corners = record.corners;
  const issues: ValidationIssue[] = [];
  if (typeof uploadId !== "string" || uploadId.length === 0) {
    issues.push({
      type: "string_type",
      loc: ["body", "upload_id"],
      msg: "upload_id is required",
    });
  }
  if (!Array.isArray(corners) || corners.length !== 4) {
    issues.push({
      type: "value_error",
      loc: ["body", "corners"],
      msg: "corners must have exactly 4 points",
    });
  } else {
    corners.forEach((corner, index) => {
      const point = corner as Record<string, unknown>;
      if (
        typeof point !== "object" ||
        point === null ||
        typeof point.x !== "number" ||
        typeof point.y !== "number"
      ) {
        issues.push({
          type: "float_type",
          loc: ["body", "corners", index],
          msg: "x and y must be numbers",
        });
      }
    });
  }
  if (issues.length > 0) return validationResponse(issues);
  return {
    uploadId: uploadId as string,
    corners: (corners as { x: number; y: number }[]).map((corner) => ({
      x: corner.x,
      y: corner.y,
    })),
  };
}
