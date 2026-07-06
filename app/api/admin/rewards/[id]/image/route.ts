import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]);

const maxImageSize = 2 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const rewardId = Number(id);

  if (!Number.isInteger(rewardId)) {
    return NextResponse.json({ message: "奖励不存在" }, { status: 400 });
  }

  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });

  if (!reward) {
    return NextResponse.json({ message: "奖励不存在" }, { status: 404 });
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ message: "请选择奖励图片" }, { status: 400 });
  }

  const extension = allowedTypes.get(image.type);

  if (!extension) {
    return NextResponse.json({ message: "只支持 PNG、JPG 或 WebP 图片" }, { status: 400 });
  }

  if (image.size > maxImageSize) {
    return NextResponse.json({ message: "图片不能超过 2MB" }, { status: 400 });
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  const uploadDir = join(process.cwd(), "public", "uploads", "rewards");
  const fileName = `reward-${rewardId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;

  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, fileName), bytes);

  const imageUrl = `/uploads/rewards/${fileName}`;
  const updatedReward = await prisma.reward.update({
    where: { id: rewardId },
    data: { imageUrl }
  });

  return NextResponse.json({ reward: updatedReward });
}
