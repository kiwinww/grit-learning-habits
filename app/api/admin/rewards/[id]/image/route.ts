import { NextResponse } from "next/server";
import sharp from "sharp";
import { checkSameOrigin, requireParent } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    checkSameOrigin(request);
    await requireParent();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id)) throw new AppError("INVALID_REWARD", "奖励不存在。", 404);
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) {
      throw new AppError("INVALID_IMAGE", "请选择 2MB 以内的 JPG、PNG 或 WebP 图片。", 400);
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      throw new AppError("INVALID_IMAGE", "只支持 JPG、PNG 或 WebP 图片。", 400);
    }
    const output = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    await prisma.reward.update({ where: { id }, data: { imageMime: "image/webp", imageData: Uint8Array.from(output) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
