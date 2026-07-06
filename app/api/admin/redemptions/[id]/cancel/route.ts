import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const redemptionId = Number(id);

  if (!Number.isInteger(redemptionId)) {
    return NextResponse.json({ message: "兑换记录不存在" }, { status: 400 });
  }

  const redemption = await prisma.redemption.findUnique({
    where: { id: redemptionId },
    include: { reward: true }
  });

  if (!redemption || redemption.status !== "requested") {
    return NextResponse.json({ message: "只能取消待处理奖励" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.redemption.update({
      where: { id: redemptionId },
      data: {
        status: "cancelled",
        cancelledAt: new Date()
      }
    }),
    prisma.child.update({
      where: { id: redemption.childId },
      data: { coinBalance: { increment: redemption.cost } }
    }),
    prisma.coinLedger.create({
      data: {
        childId: redemption.childId,
        amount: redemption.cost,
        reason: `取消兑换退回：${redemption.reward.title}`,
        sourceType: "redemption_cancel",
        sourceId: redemption.id
      }
    })
  ]);

  return NextResponse.json({ ok: true });
}
