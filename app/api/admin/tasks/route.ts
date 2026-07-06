import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const points = Number(body.points);

  if (!title || !description || !Number.isFinite(points) || points < 0) {
    return NextResponse.json({ message: "请填写完整任务信息" }, { status: 400 });
  }

  const count = await prisma.taskTemplate.count();
  const task = await prisma.taskTemplate.create({
    data: {
      slug: slug("task"),
      title,
      description,
      points: Math.round(points),
      sortOrder: count + 1,
      enabled: true
    }
  });

  return NextResponse.json({ task });
}
