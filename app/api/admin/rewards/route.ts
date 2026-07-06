import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slug(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const cost = Number(body.cost);

  if (!title || !description || !Number.isFinite(cost) || cost < 0) {
    return NextResponse.json({ message: "请填写完整奖励信息" }, { status: 400 });
  }

  const count = await prisma.reward.count();
  const reward = await prisma.reward.create({
    data: {
      slug: slug("reward"),
      title,
      description,
      cost: Math.round(cost),
      tier: String(body.tier ?? "自定义奖励").trim() || "自定义奖励",
      category: String(body.category ?? "custom").trim() || "custom",
      sortOrder: count + 1,
      enabled: true
    }
  });

  return NextResponse.json({ reward });
}
