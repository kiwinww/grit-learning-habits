import { NextResponse } from "next/server";
import { checkSameOrigin, requireParent } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/errors";
import { runAdminAction } from "@/lib/service";
import { getAdminState } from "@/lib/state";

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
    await requireParent();
    const input = await readJson(request);
    await runAdminAction(input);
    return NextResponse.json(await getAdminState());
  } catch (error) {
    return errorResponse(error);
  }
}
