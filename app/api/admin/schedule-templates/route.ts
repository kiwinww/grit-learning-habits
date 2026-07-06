import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ message: "请填写日程模板名称" }, { status: 400 });
  }

  const template = await prisma.scheduleTemplate.create({
    data: {
      slug: slug("schedule"),
      name,
      weekdays: String(body.weekdays ?? "0,1,2,3,4,5,6"),
      enabled: true
    }
  });

  return NextResponse.json({ template });
}
