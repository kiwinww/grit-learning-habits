import { NextResponse } from "next/server";
import { getAppState } from "@/lib/app-state";
import { todayKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const rewardId = Number(id);

  if (!Number.isInteger(rewardId)) {
    return NextResponse.json({ message: "奖励不存在" }, { status: 400 });
  }

  const child = await prisma.child.findFirst({ orderBy: { id: "asc" } });
  const reward = await prisma.reward.findFirst({
    where: { id: rewardId, enabled: true }
  });

  if (!child || !reward) {
    return NextResponse.json({ message: "奖励不存在或已停用" }, { status: 404 });
  }

  if (child.coinBalance < reward.cost) {
    return NextResponse.json(
      {
        message: `还差 ${reward.cost - child.coinBalance} 个星币，再完成一个任务就更近啦。`,
        shortage: reward.cost - child.coinBalance
      },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    const redemption = await tx.redemption.create({
      data: {
        childId: child.id,
        rewardId: reward.id,
        cost: reward.cost,
        status: "requested"
      }
    });

    await tx.child.update({
      where: { id: child.id },
      data: { coinBalance: { decrement: reward.cost } }
    });

    await tx.coinLedger.create({
      data: {
        childId: child.id,
        amount: -reward.cost,
        reason: `兑换奖励：${reward.title}`,
        sourceType: "redemption",
        sourceId: redemption.id
      }
    });
  });

  return NextResponse.json(await getAppState(todayKey()));
}
