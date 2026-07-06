import { NextResponse } from "next/server";
import { getAdminState } from "@/lib/app-state";
import { prisma } from "@/lib/prisma";

const initialCoins = 0;

export async function POST() {
  const child = await prisma.child.findFirst({ orderBy: { id: "asc" } });

  if (!child) {
    return NextResponse.json({ message: "孩子档案不存在" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.taskCompletion.deleteMany({ where: { childId: child.id } });
    await tx.redemption.deleteMany({ where: { childId: child.id } });
    await tx.coinLedger.deleteMany({ where: { childId: child.id } });
    await tx.weeklyReview.deleteMany({ where: { childId: child.id } });
    await tx.child.update({
      where: { id: child.id },
      data: { coinBalance: initialCoins }
    });
    await tx.coinLedger.create({
      data: {
        childId: child.id,
        amount: initialCoins,
        reason: "初始星币",
        sourceType: "reset"
      }
    });
  });

  return NextResponse.json(await getAdminState());
}
