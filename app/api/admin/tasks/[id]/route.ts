import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const taskId = Number(id);
  const body = await request.json();

  if (!Number.isInteger(taskId)) {
    return NextResponse.json({ message: "任务不存在" }, { status: 400 });
  }

  const task = await prisma.taskTemplate.update({
    where: { id: taskId },
    data: {
      title: String(body.title ?? "").trim(),
      description: String(body.description ?? "").trim(),
      points: Math.max(0, Math.round(Number(body.points ?? 0))),
      enabled: Boolean(body.enabled)
    }
  });

  return NextResponse.json({ task });
}
