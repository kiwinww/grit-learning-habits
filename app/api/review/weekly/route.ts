import { NextResponse } from "next/server";
import { getWeeklyReviewState } from "@/lib/weekly-review";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const weekStart = url.searchParams.get("weekStart") ?? undefined;

  return NextResponse.json(await getWeeklyReviewState(weekStart));
}
