import { NextResponse } from "next/server";
import { saveWeeklyReview } from "@/lib/weekly-review";

export async function POST(request: Request) {
  const body = await request.json();
  const weekStart = String(body.weekStart ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ message: "请选择正确的周起始日期" }, { status: 400 });
  }

  const review = await saveWeeklyReview({
    weekStart,
    observation: String(body.observation ?? "").trim(),
    nextFocus: String(body.nextFocus ?? "").trim()
  });

  return NextResponse.json({ review });
}
