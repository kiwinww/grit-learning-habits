import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { getChildState } from "@/lib/state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getChildState());
  } catch (error) {
    return errorResponse(error);
  }
}
