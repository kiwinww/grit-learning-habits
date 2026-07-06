import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const rewardId = Number(id);
  const body = await request.json();

  if (!Number.isInteger(rewardId)) {
    return NextResponse.json({ message: "奖励不存在" }, { status: 400 });
  }

  const reward = await prisma.reward.update({
    where: { id: rewardId },
    data: {
      title: String(body.title ?? "").trim(),
      description: String(body.description ?? "").trim(),
      cost: Math.max(0, Math.round(Number(body.cost ?? 0))),
      tier: String(body.tier ?? "").trim() || "自定义奖励",
      category: String(body.category ?? "").trim() || "custom",
      enabled: Boolean(body.enabled)
    }
  });

  return NextResponse.json({ reward });
}
