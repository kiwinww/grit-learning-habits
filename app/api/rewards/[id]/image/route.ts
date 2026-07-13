import { AppError, errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const id = Number((await context.params).id);
    const reward = Number.isInteger(id) ? await prisma.reward.findUnique({ where: { id } }) : null;
    if (!reward?.imageData || !reward.imageMime) throw new AppError("IMAGE_NOT_FOUND", "图片不存在。", 404);
    return new Response(new Uint8Array(reward.imageData), {
      headers: { "content-type": reward.imageMime, "cache-control": "public, max-age=3600" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
