import { NextResponse } from "next/server";
import { checkSameOrigin, loginParent } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/errors";
import { initializeFamily } from "@/lib/service";

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
    const input = await readJson(request);
    await initializeFamily(input);
    await loginParent(String(input.pin ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
