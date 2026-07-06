import { NextResponse } from "next/server";
import { todayKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const action = String(body.action ?? "add");
  const date = String(body.date ?? todayKey());

  if (!["add", "update", "hide"].includes(action)) {
    return NextResponse.json({ message: "日程调整类型不正确" }, { status: 400 });
  }

  const override = await prisma.dailyScheduleOverride.create({
    data: {
      date,
      action,
      blockId: body.blockId ? Number(body.blockId) : null,
      startTime: body.startTime ? String(body.startTime) : null,
      endTime: body.endTime ? String(body.endTime) : null,
      title: body.title ? String(body.title).trim() : null,
      description: body.description ? String(body.description).trim() : null,
      type: body.type ? String(body.type) : null,
      taskId: body.taskId ? Number(body.taskId) : null,
      sortOrder: body.sortOrder ? Number(body.sortOrder) : null
    }
  });

  return NextResponse.json({ override });
}
