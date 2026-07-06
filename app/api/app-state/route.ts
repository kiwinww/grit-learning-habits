import { NextResponse } from "next/server";
import { getAppState } from "@/lib/app-state";

export async function GET() {
  return NextResponse.json(await getAppState());
}
