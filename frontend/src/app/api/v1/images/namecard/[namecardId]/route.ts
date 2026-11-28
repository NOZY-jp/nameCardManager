import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth/guard";
import { serviceError, validationResponse } from "@/lib/namecards/http";
import { listNameCardImages } from "@/lib/namecards/service";

type Params = { params: Promise<{ namecardId: string }> };

/** GET /api/v1/images/namecard/{namecardId}（全画像の一覧）。 */
export async function GET(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const raw = (await params).namecardId;
  if (!/^\d+$/.test(raw)) {
    return validationResponse([
      {
        type: "int_parsing",
        loc: ["path", "namecard_id"],
        msg: "Input should be a valid integer",
      },
    ]);
  }
  try {
    return NextResponse.json({
      images: await listNameCardImages(user.id, Number(raw)),
    });
  } catch (error) {
    return serviceError(error);
  }
}
