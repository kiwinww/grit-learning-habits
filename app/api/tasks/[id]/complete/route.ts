import { NextResponse } from "next/server";
import { getAppState } from "@/lib/app-state";
import { todayKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ message: "任务不存在" }, { status: 400 });
  }

  const date = todayKey();
  const child = await prisma.child.findFirst({ orderBy: { id: "asc" } });
  const task = await prisma.taskTemplate.findFirst({
    where: { id: taskId, enabled: true }
  });

  if (!child || !task) {
    return NextResponse.json({ message: "任务不存在或已停用" }, { status: 404 });
  }

  const existing = await prisma.taskCompletion.findUnique({
    where: {
      childId_taskId_date: {
        childId: child.id,
        taskId,
        date
      }
    }
  });

  if (!existing) {
    await prisma.$transaction([
      prisma.taskCompletion.create({
        data: {
          childId: child.id,
          taskId,
          date,
          pointsAwarded: task.points
        }
      }),
      prisma.child.update({
        where: { id: child.id },
        data: { coinBalance: { increment: task.points } }
      }),
      prisma.coinLedger.create({
        data: {
          childId: child.id,
          amount: task.points,
          reason: `完成任务：${task.title}`,
          sourceType: "task",
          sourceId: task.id
        }
      })
    ]);
  }

  return NextResponse.json(await getAppState(date));
}
