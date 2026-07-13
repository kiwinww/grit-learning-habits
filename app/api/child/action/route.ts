import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/auth";
import { AppError, errorResponse, readJson } from "@/lib/errors";
import { completeTask, redeemReward, setTargetReward } from "@/lib/service";
import { getChildState } from "@/lib/state";

export async function POST(request: Request) {
  try {
    checkSameOrigin(request);
    const input = await readJson(request);
    if (input.action === "completeTask") await completeTask(input);
    else if (input.action === "redeemReward") await redeemReward(input);
    else if (input.action === "setTargetReward") await setTargetReward(input);
    else throw new AppError("UNKNOWN_ACTION", "不支持的孩子端操作。", 400);
    return NextResponse.json(await getChildState());
  } catch (error) {
    return errorResponse(error);
  }
}
