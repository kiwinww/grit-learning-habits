import { NextResponse } from "next/server";
import { checkSameOrigin, loginParent, logoutParent } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
    const input = await readJson(request);
    await loginParent(String(input.pin ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkSameOrigin(request);
    await logoutParent();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
