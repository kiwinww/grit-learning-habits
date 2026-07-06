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

  const redemption = await prisma.redemption.findUnique({ where: { id: redemptionId } });

  if (!redemption || redemption.status !== "requested") {
    return NextResponse.json({ message: "只能兑现待处理奖励" }, { status: 400 });
  }

  await prisma.redemption.update({
    where: { id: redemptionId },
    data: {
      status: "delivered",
      deliveredAt: new Date()
    }
  });

  return NextResponse.json({ ok: true });
}
