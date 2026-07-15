import { NextResponse } from "next/server";
import { requireParent } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { getAdminState } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireParent();
    return NextResponse.json(await getAdminState());
  } catch (error) {
    if (error instanceof AppError && (error.code === "PARENT_AUTH_REQUIRED" || error.code === "SESSION_EXPIRED")) {
      return NextResponse.json({ authenticated: false });
    }
    return errorResponse(error);
  }
}
