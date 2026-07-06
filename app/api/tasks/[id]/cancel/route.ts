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

  if (!child) {
    return NextResponse.json({ message: "孩子档案不存在" }, { status: 404 });
  }

  const completion = await prisma.taskCompletion.findUnique({
    where: {
      childId_taskId_date: {
        childId: child.id,
        taskId,
        date
      }
    },
    include: { task: true }
  });

  if (!completion) {
    return NextResponse.json({ message: "今天还没有完成这个任务" }, { status: 400 });
  }

  if (child.coinBalance < completion.pointsAwarded) {
    return NextResponse.json(
      { message: "星币余额不足，先处理已兑换奖励后再取消。" },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.taskCompletion.delete({ where: { id: completion.id } }),
    prisma.child.update({
      where: { id: child.id },
      data: { coinBalance: { decrement: completion.pointsAwarded } }
    }),
    prisma.coinLedger.create({
      data: {
        childId: child.id,
        amount: -completion.pointsAwarded,
        reason: `取消完成：${completion.task.title}`,
        sourceType: "task_cancel",
        sourceId: completion.taskId
      }
    })
  ]);

  return NextResponse.json(await getAppState(date));
}
