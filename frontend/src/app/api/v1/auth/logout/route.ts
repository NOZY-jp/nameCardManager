import { NextResponse } from "next/server";
import { signOut } from "@/auth";

/** POST /api/v1/auth/logout（セッション Cookie を破棄する）。 */
export async function POST(): Promise<NextResponse> {
  await signOut({ redirect: false });
  return new NextResponse(null, { status: 204 });
}
