import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function slug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const templateId = Number(id);
  const body = await request.json();

  if (!Number.isInteger(templateId)) {
    return NextResponse.json({ message: "日程模板不存在" }, { status: 400 });
  }

  const blocks = Array.isArray(body.blocks) ? body.blocks : [];

  await prisma.$transaction(async (tx) => {
    await tx.scheduleTemplate.update({
      where: { id: templateId },
      data: {
        name: String(body.name ?? "").trim() || "每日作息模板",
        weekdays: String(body.weekdays ?? "0,1,2,3,4,5,6"),
        enabled: Boolean(body.enabled)
      }
    });

    for (const block of blocks) {
      const data = {
        startTime: String(block.startTime ?? "18:00"),
        endTime: String(block.endTime ?? "18:20"),
        title: String(block.title ?? "").trim() || "日程安排",
        description: String(block.description ?? "").trim() || "家长填写的安排",
        type: String(block.type ?? "routine"),
        taskId: block.taskId ? Number(block.taskId) : null,
        enabled: Boolean(block.enabled),
        sortOrder: Math.round(Number(block.sortOrder ?? 99))
      };

      if (block.id) {
        await tx.scheduleBlock.update({
          where: { id: Number(block.id) },
          data
        });
      } else {
        await tx.scheduleBlock.create({
          data: {
            ...data,
            slug: slug("block"),
            templateId
          }
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
