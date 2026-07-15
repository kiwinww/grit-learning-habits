import { NextResponse } from "next/server";
import { checkSameOrigin, requireParent } from "@/lib/auth";
import { createBackup, restoreBackup } from "@/lib/backup";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    await requireParent();
    const backup = await createBackup();
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="family-star-coin-${new Date().toISOString().slice(0, 10)}.json"`
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
    await requireParent();
    await restoreBackup(await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
