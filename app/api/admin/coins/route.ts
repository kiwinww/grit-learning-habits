import { NextResponse } from "next/server";
import { getAdminState } from "@/lib/app-state";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const balance = Number(body.balance);
  const reason = String(body.reason ?? "").trim() || "家长手动调整星币";

  if (!Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({ message: "星币余额不能小于 0" }, { status: 400 });
  }

  const nextBalance = Math.round(balance);
  const child = await prisma.child.findFirst({ orderBy: { id: "asc" } });

  if (!child) {
    return NextResponse.json({ message: "孩子档案不存在" }, { status: 400 });
  }

  const difference = nextBalance - child.coinBalance;

  await prisma.$transaction(async (tx) => {
    await tx.child.update({
      where: { id: child.id },
      data: { coinBalance: nextBalance }
    });

    if (difference !== 0) {
      await tx.coinLedger.create({
        data: {
          childId: child.id,
          amount: difference,
          reason,
          sourceType: "manual_adjust"
        }
      });
    }
  });

  return NextResponse.json(await getAdminState());
}
