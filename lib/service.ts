import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { addDays, businessDate, clampInt, isValidTimezone, sumLedger, utcForFamilyDate, weekBounds } from "@/lib/domain";
import { hashPin, verifyPin } from "@/lib/security";
import { serializeHeroMessages } from "@/lib/hero-messages";
import { saveServerBackup } from "@/lib/backup";

function text(value: unknown, field: string, max = 120) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) throw new AppError("VALIDATION_ERROR", `${field}填写不正确。`, 400, { [field]: `请输入 1-${max} 个字符。` });
  return result;
}

function bool(value: unknown) {
  return value === true;
}

function optionalInt(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = clampInt(value, min, max);
  if (parsed === null) throw new AppError("VALIDATION_ERROR", "数字填写不正确。", 400);
  return parsed;
}

function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function timeValue(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) {
    throw new AppError("VALIDATION_ERROR", "时间填写不正确。", 400, { [field]: "请选择有效时间。" });
  }
  return result;
}

function dateValue(value: unknown, field: string) {
  const result = typeof value === "string" ? value.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || !date || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new AppError("VALIDATION_ERROR", "日期填写不正确。", 400, { [field]: "请选择有效日期。" });
  }
  return result;
}

type TaskPlanSchedule = {
  scheduleType: "weekly" | "date";
  weekday: number | null;
  specificDate: string | null;
  startTime: string;
  endTime: string;
  reminder: boolean;
};

function taskPlanSchedules(value: unknown): TaskPlanSchedule[] {
  if (!Array.isArray(value)) throw new AppError("VALIDATION_ERROR", "请填写任务安排。", 400);
  const schedules: TaskPlanSchedule[] = [];
  const signatures = new Set<string>();

  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") throw new AppError("VALIDATION_ERROR", "任务安排填写不正确。", 400);
    const item = raw as Record<string, unknown>;
    const scheduleType = item.scheduleType === "date" ? "date" : "weekly";
    const startTime = timeValue(item.startTime, `schedules.${index}.startTime`);
    const endTime = timeValue(item.endTime, `schedules.${index}.endTime`);
    if (startTime >= endTime) throw new AppError("VALIDATION_ERROR", "结束时间必须晚于开始时间。", 400);
    const reminder = item.reminder === undefined ? true : bool(item.reminder);

    if (scheduleType === "date") {
      const specificDate = dateValue(item.specificDate, `schedules.${index}.specificDate`);
      const signature = `date:${specificDate}:${startTime}:${endTime}:${reminder}`;
      if (!signatures.has(signature)) {
        signatures.add(signature);
        schedules.push({ scheduleType, weekday: null, specificDate, startTime, endTime, reminder });
      }
      continue;
    }

    const weekdays = Array.isArray(item.weekdays) ? item.weekdays : [];
    const parsedWeekdays = [...new Set(weekdays.map((weekday) => clampInt(weekday, 0, 6)).filter((weekday): weekday is number => weekday !== null))].sort();
    if (!parsedWeekdays.length || parsedWeekdays.length !== weekdays.length) {
      throw new AppError("VALIDATION_ERROR", "请选择不重复的星期。", 400);
    }
    for (const weekday of parsedWeekdays) {
      const signature = `weekly:${weekday}:${startTime}:${endTime}:${reminder}`;
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      schedules.push({ scheduleType, weekday, specificDate: null, startTime, endTime, reminder });
    }
  }

  return schedules;
}

async function familyAndChild() {
  const family = await prisma.familySetting.findUnique({ where: { id: 1 } });
  const child = await prisma.child.findFirst({ where: { enabled: true }, orderBy: { id: "asc" } });
  if (!family || !child) throw new AppError("NOT_INITIALIZED", "请先完成家庭初始化。", 409);
  return { family, child };
}

export async function initializeFamily(input: Record<string, unknown>) {
  if (await prisma.familySetting.findUnique({ where: { id: 1 } })) {
    throw new AppError("ALREADY_INITIALIZED", "家庭已经完成初始化。", 409);
  }
  const expectedSecret = process.env.BOOTSTRAP_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "setup-local");
  if (!expectedSecret || input.bootstrapSecret !== expectedSecret) {
    throw new AppError("INVALID_BOOTSTRAP_SECRET", "初始化密钥不正确。", 403);
  }
  const familyName = text(input.familyName, "familyName", 30);
  const nickname = text(input.nickname, "nickname", 20);
  const timezone = text(input.timezone, "timezone", 60);
  const pin = typeof input.pin === "string" ? input.pin : "";
  if (!/^\d{4,6}$/.test(pin)) throw new AppError("INVALID_PIN", "PIN 必须是 4 至 6 位数字。", 400);
  if (!isValidTimezone(timezone)) throw new AppError("INVALID_TIMEZONE", "请选择有效的家庭时区。", 400);
  const pinValue = await hashPin(pin);
  await prisma.$transaction(async (tx) => {
    await tx.familySetting.create({
      data: { id: 1, familyName, timezone, parentPinHash: pinValue.hash, parentPinSalt: pinValue.salt }
    });
    await tx.child.create({ data: { nickname } });
  });
}

export async function completeTask(input: Record<string, unknown>, options: { parent?: boolean } = {}) {
  const { family, child } = await familyAndChild();
  const taskId = clampInt(input.taskId, 1, Number.MAX_SAFE_INTEGER);
  if (!taskId) throw new AppError("INVALID_TASK", "任务不存在。", 404);
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !task.enabled || task.deletedAt) throw new AppError("INVALID_TASK", "任务不存在或已经停用。", 404);
  const today = businessDate(new Date(), family.timezone);
  const targetDate = options.parent && typeof input.businessDate === "string" ? input.businessDate : today;
  const isBackfill = targetDate !== today;
  if (isBackfill && (!options.parent || !family.allowBackfill || targetDate !== addDays(today, -1))) {
    throw new AppError("BACKFILL_NOT_ALLOWED", "只允许家长补录昨天的任务。", 403);
  }
  if (!options.parent) {
    const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
    const scheduled = await prisma.schedule.findFirst({
      where: { enabled: true, taskId, OR: [{ scheduleType: "weekly", weekday }, { scheduleType: "date", specificDate: today }] }
    });
    if (!scheduled) throw new AppError("TASK_NOT_TODAY", "这个任务不在今天的日程中。", 409);
  }
  const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 100
    ? input.idempotencyKey
    : `completion:${child.id}:${taskId}:${targetDate}:${crypto.randomUUID()}`;

  try {
    return await prisma.$transaction(async (tx) => {
      const status = task.requiresApproval && !options.parent ? "pending" : "approved";
      const existing = await tx.completion.findFirst({
        where: { childId: child.id, taskId, businessDate: targetDate }
      });
      if (existing && existing.status !== "revoked") return existing;
      const completionData = {
          childId: child.id,
          taskId,
          businessDate: targetDate,
          status,
          pointsAwarded: task.points,
          taskTitleSnapshot: task.title,
          taskDetailsSnapshot: task.childDescription,
          isBackfill,
          countForStreak: isBackfill ? bool(input.countForStreak) : true,
          approvedAt: status === "approved" ? new Date() : null,
          idempotencyKey
      };
      let completion;
      if (existing) {
        const restored = await tx.completion.updateMany({
          where: { id: existing.id, status: "revoked" },
          data: { ...completionData, completedAt: new Date(), revokedAt: null, revokeReason: null }
        });
        if (restored.count === 0) return tx.completion.findUnique({ where: { id: existing.id } });
        completion = await tx.completion.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        completion = await tx.completion.create({ data: completionData });
      }
      if (status === "approved" && task.points !== 0) {
        await tx.coinTransaction.create({
          data: {
            childId: child.id,
            amount: task.points,
            type: "TASK_EARN",
            reason: `完成任务：${task.title}`,
            sourceType: "completion",
            sourceId: completion.id,
            completionId: completion.id,
            idempotencyKey: `award:${completion.id}:${completion.idempotencyKey}`
          }
        });
      }
      return completion;
    });
  } catch (error) {
    if (isUniqueError(error)) {
      return prisma.completion.findFirst({
        where: { OR: [{ idempotencyKey }, { childId: child.id, taskId, businessDate: targetDate }] },
        orderBy: { completedAt: "desc" }
      });
    }
    throw error;
  }
}

export async function cancelPendingCompletion(input: Record<string, unknown>) {
  const { family, child } = await familyAndChild();
  const completionId = clampInt(input.completionId, 1, Number.MAX_SAFE_INTEGER);
  const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 100 ? input.idempotencyKey : "";
  if (!completionId || !idempotencyKey) throw new AppError("INVALID_COMPLETION", "待取消的完成记录不正确。", 400);
  try {
    await prisma.$transaction(async (tx) => {
      if (await tx.adminOperation.findUnique({ where: { idempotencyKey } })) return;
      const completion = await tx.completion.findUnique({ where: { id: completionId } });
      if (!completion || completion.childId !== child.id || completion.businessDate !== businessDate(new Date(), family.timezone) || completion.status !== "pending") {
        throw new AppError("CANCEL_NOT_ALLOWED", "只有今天仍在等待家长确认的任务可以取消。", 409);
      }
      if (await tx.coinTransaction.count({ where: { completionId } })) {
        throw new AppError("CANCEL_NOT_ALLOWED", "这项任务已经产生星币流水，请联系家长处理。", 409);
      }
      await tx.completion.delete({ where: { id: completionId } });
      await tx.adminOperation.create({ data: { idempotencyKey, action: "cancelPendingCompletion" } });
    });
  } catch (error) {
    if (isUniqueError(error)) return;
    throw error;
  }
}

export async function setTargetReward(input: Record<string, unknown>) {
  const rewardId = input.rewardId === null ? null : clampInt(input.rewardId, 1, Number.MAX_SAFE_INTEGER);
  if (rewardId) {
    const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
    if (!reward?.enabled || reward.deletedAt) throw new AppError("INVALID_REWARD", "奖励不存在或已经停用。", 404);
  }
  await prisma.familySetting.update({ where: { id: 1 }, data: { targetRewardId: rewardId } });
}

export async function redeemReward(input: Record<string, unknown>) {
  const { family, child } = await familyAndChild();
  const rewardId = clampInt(input.rewardId, 1, Number.MAX_SAFE_INTEGER);
  if (!rewardId) throw new AppError("INVALID_REWARD", "奖励不存在。", 404);
  const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 100
    ? input.idempotencyKey
    : `redeem:${child.id}:${rewardId}:${Date.now()}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward?.enabled || reward.deletedAt) throw new AppError("INVALID_REWARD", "奖励不存在或已经停用。", 404);
      const balance = sumLedger(await tx.coinTransaction.findMany({ where: { childId: child.id }, select: { amount: true } }));
      if (balance < reward.cost) throw new AppError("INSUFFICIENT_COINS", `还差 ${reward.cost - balance} 枚星币。`, 409);
      const today = businessDate(new Date(), family.timezone);
      const bounds = weekBounds(today);
      if (reward.dailyLimit) {
        const start = utcForFamilyDate(today, family.timezone);
        const end = utcForFamilyDate(addDays(today, 1), family.timezone);
        const count = await tx.redemption.count({ where: { childId: child.id, rewardId, requestedAt: { gte: start, lt: end }, status: { not: "cancelled" } } });
        if (count >= reward.dailyLimit) throw new AppError("REWARD_LIMIT", "今天已经达到兑换次数限制。", 409);
      }
      if (reward.weeklyLimit) {
        const count = await tx.redemption.count({
          where: { childId: child.id, rewardId, requestedAt: { gte: utcForFamilyDate(bounds.start, family.timezone), lt: utcForFamilyDate(addDays(bounds.end, 1), family.timezone) }, status: { not: "cancelled" } }
        });
        if (count >= reward.weeklyLimit) throw new AppError("REWARD_LIMIT", "本周已经达到兑换次数限制。", 409);
      }
      const redemption = await tx.redemption.create({
        data: {
          childId: child.id,
          rewardId,
          actualCost: reward.cost,
          rewardTitleSnapshot: reward.title,
          rewardDescriptionSnapshot: reward.description,
          idempotencyKey
        }
      });
      await tx.coinTransaction.create({
        data: {
          childId: child.id,
          amount: -reward.cost,
          type: "REWARD_SPEND",
          reason: `兑换奖励：${reward.title}`,
          sourceType: "redemption",
          sourceId: redemption.id,
          idempotencyKey: `spend:${redemption.id}`
        }
      });
      return redemption;
    });
  } catch (error) {
    if (isUniqueError(error)) return prisma.redemption.findUnique({ where: { idempotencyKey } });
    throw error;
  }
}

export async function runAdminAction(input: Record<string, unknown>) {
  const action = input.action;
  switch (action) {
    case "saveTaskPlan": {
      const id = optionalInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      const title = text(input.title, "title", 40);
      const childDescription = text(input.childDescription, "childDescription", 120);
      const enabled = input.enabled === undefined ? true : bool(input.enabled);
      const schedules = taskPlanSchedules(input.schedules);
      if (enabled && !schedules.length) throw new AppError("VALIDATION_ERROR", "启用的任务至少需要一个时间安排。", 400);

      return prisma.$transaction(async (tx) => {
        const existing = id ? await tx.task.findFirst({ where: { id, deletedAt: null } }) : null;
        if (id && !existing) throw new AppError("INVALID_TASK", "任务不存在或已经删除。", 404);
        const data = {
          title,
          childDescription,
          points: clampInt(input.points, 0, 999) ?? 0,
          requiresApproval: bool(input.requiresApproval),
          enabled
        };
        const task = existing
          ? await tx.task.update({ where: { id: existing.id }, data })
          : await tx.task.create({ data: { ...data, category: "learning", isCore: false } });

        await tx.schedule.deleteMany({ where: { taskId: task.id } });
        if (schedules.length) {
          await tx.schedule.createMany({
            data: schedules.map((schedule, sortOrder) => ({
              taskId: task.id,
              title: task.title,
              description: task.childDescription,
              scheduleType: schedule.scheduleType,
              weekday: schedule.weekday,
              specificDate: schedule.specificDate,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              reminder: schedule.reminder,
              enabled: task.enabled,
              sortOrder
            }))
          });
        }
        return task;
      });
    }
    case "saveTask": {
      const id = optionalInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      const existing = id ? await prisma.task.findFirst({ where: { id, deletedAt: null } }) : null;
      if (id && !existing) throw new AppError("INVALID_TASK", "任务不存在或已经删除。", 404);
      const data = {
        title: text(input.title, "title", 40),
        childDescription: text(input.childDescription, "childDescription", 120),
        category: input.category === undefined ? existing?.category ?? "learning" : text(input.category, "category", 30),
        points: clampInt(input.points, 0, 999) ?? 0,
        requiresApproval: input.requiresApproval === undefined ? existing?.requiresApproval ?? false : bool(input.requiresApproval),
        isCore: input.isCore === undefined ? existing?.isCore ?? false : bool(input.isCore),
        enabled: input.enabled === undefined ? existing?.enabled ?? true : bool(input.enabled),
        sortOrder: input.sortOrder === undefined ? existing?.sortOrder ?? 0 : clampInt(input.sortOrder, 0, 999) ?? 0
      };
      return existing ? prisma.task.update({ where: { id: existing.id }, data }) : prisma.task.create({ data });
    }
    case "saveSchedule": {
      const id = optionalInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      const scheduleType = input.scheduleType === "date" ? "date" : "weekly";
      const taskId = optionalInt(input.taskId, 1, Number.MAX_SAFE_INTEGER);
      const startTime = timeValue(input.startTime, "startTime");
      const endTime = timeValue(input.endTime, "endTime");
      if (startTime >= endTime) throw new AppError("VALIDATION_ERROR", "结束时间必须晚于开始时间。", 400);
      const data = {
        taskId,
        title: text(input.title, "title", 50),
        description: text(input.description, "description", 140),
        scheduleType,
        weekday: scheduleType === "weekly" ? optionalInt(input.weekday, 0, 6) : null,
        specificDate: scheduleType === "date" ? dateValue(input.specificDate, "specificDate") : null,
        startTime,
        endTime,
        reminder: input.reminder === undefined ? true : bool(input.reminder),
        enabled: input.enabled === undefined ? true : bool(input.enabled),
        sortOrder: clampInt(input.sortOrder ?? 0, 0, 999) ?? 0
      };
      return id ? prisma.schedule.update({ where: { id }, data }) : prisma.schedule.create({ data });
    }
    case "deleteTask": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      if (!id) throw new AppError("INVALID_TASK", "任务不存在。", 404);
      return prisma.$transaction(async (tx) => {
        const result = await tx.task.updateMany({ where: { id, deletedAt: null }, data: { enabled: false, deletedAt: new Date() } });
        if (!result.count) throw new AppError("INVALID_TASK", "任务不存在或已经删除。", 404);
        await tx.schedule.updateMany({ where: { taskId: id }, data: { enabled: false } });
        return result;
      });
    }
    case "deleteSchedule": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      if (!id) throw new AppError("INVALID_SCHEDULE", "日程不存在。", 404);
      const result = await prisma.schedule.deleteMany({ where: { id } });
      if (!result.count) throw new AppError("INVALID_SCHEDULE", "日程不存在或已经删除。", 404);
      return result;
    }
    case "saveReward": {
      const id = optionalInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      const existing = id ? await prisma.reward.findFirst({ where: { id, deletedAt: null } }) : null;
      if (id && !existing) throw new AppError("INVALID_REWARD", "奖励不存在或已经删除。", 404);
      const data = {
        title: text(input.title, "title", 50),
        description: text(input.description, "description", 140),
        cost: clampInt(input.cost, 0, 99999) ?? 0,
        category: input.category === undefined ? existing?.category ?? "奖励" : text(input.category, "category", 30),
        dailyLimit: input.dailyLimit === undefined ? existing?.dailyLimit ?? null : optionalInt(input.dailyLimit, 1, 99),
        weeklyLimit: input.weeklyLimit === undefined ? existing?.weeklyLimit ?? null : optionalInt(input.weeklyLimit, 1, 99),
        enabled: input.enabled === undefined ? true : bool(input.enabled),
        sortOrder: input.sortOrder === undefined ? existing?.sortOrder ?? 0 : clampInt(input.sortOrder, 0, 999) ?? 0
      };
      return existing ? prisma.reward.update({ where: { id: existing.id }, data }) : prisma.reward.create({ data });
    }
    case "deleteReward": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      if (!id) throw new AppError("INVALID_REWARD", "奖励不存在。", 404);
      return prisma.$transaction(async (tx) => {
        const result = await tx.reward.updateMany({ where: { id, deletedAt: null }, data: { enabled: false, deletedAt: new Date() } });
        if (!result.count) throw new AppError("INVALID_REWARD", "奖励不存在或已经删除。", 404);
        await tx.familySetting.updateMany({ where: { id: 1, targetRewardId: id }, data: { targetRewardId: null } });
        return result;
      });
    }
    case "adjustCoins": {
      const { child } = await familyAndChild();
      const amount = clampInt(input.amount, -99999, 99999);
      if (!amount || amount === 0) throw new AppError("INVALID_AMOUNT", "调整数量不能为零。", 400);
      const reason = text(input.reason, "reason", 120);
      return prisma.coinTransaction.create({
        data: { childId: child.id, amount, type: "PARENT_ADJUST", reason, sourceType: "parent", idempotencyKey: `adjust:${crypto.randomUUID()}` }
      });
    }
    case "approveCompletion": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      if (!id) throw new AppError("INVALID_COMPLETION", "完成记录不存在。", 404);
      return prisma.$transaction(async (tx) => {
        const item = await tx.completion.findUnique({ where: { id } });
        if (!item || item.status !== "pending") throw new AppError("INVALID_COMPLETION", "这条任务不再等待确认。", 409);
        await tx.coinTransaction.create({
          data: { childId: item.childId, amount: item.pointsAwarded, type: "TASK_EARN", reason: `家长确认：${item.taskTitleSnapshot}`, sourceType: "completion", sourceId: item.id, completionId: item.id, idempotencyKey: `award:${item.id}:${item.idempotencyKey}` }
        });
        return tx.completion.update({ where: { id }, data: { status: "approved", approvedAt: new Date() } });
      });
    }
    case "revokeCompletion": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      const reason = text(input.reason, "reason", 120);
      if (!id) throw new AppError("INVALID_COMPLETION", "完成记录不存在。", 404);
      return prisma.$transaction(async (tx) => {
        const item = await tx.completion.findUnique({ where: { id } });
        if (!item || item.status !== "approved") throw new AppError("INVALID_COMPLETION", "这条任务不能撤销。", 409);
        const balance = sumLedger(await tx.coinTransaction.findMany({ where: { childId: item.childId }, select: { amount: true } }));
        if (balance < item.pointsAwarded && !bool(input.allowNegative)) {
          throw new AppError("NEGATIVE_CONFIRMATION_REQUIRED", `当前只有 ${balance} 枚星币，撤销后将出现负余额，请再次确认。`, 409);
        }
        await tx.coinTransaction.create({
          data: { childId: item.childId, amount: -item.pointsAwarded, type: "COMPLETION_REVERSAL", reason, sourceType: "completion", sourceId: item.id, completionId: item.id, idempotencyKey: `revoke:${item.id}` }
        });
        return tx.completion.update({ where: { id }, data: { status: "revoked", revokedAt: new Date(), revokeReason: reason } });
      });
    }
    case "fulfillRedemption": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      if (!id) throw new AppError("INVALID_REDEMPTION", "兑换记录不存在。", 404);
      return prisma.redemption.updateMany({ where: { id, status: "pending" }, data: { status: "fulfilled", fulfilledAt: new Date() } });
    }
    case "cancelRedemption": {
      const id = clampInt(input.id, 1, Number.MAX_SAFE_INTEGER);
      const reason = text(input.reason, "reason", 120);
      if (!id) throw new AppError("INVALID_REDEMPTION", "兑换记录不存在。", 404);
      return prisma.$transaction(async (tx) => {
        const item = await tx.redemption.findUnique({ where: { id } });
        if (!item || item.status !== "pending" || item.refundTransactionId) throw new AppError("INVALID_REDEMPTION", "这条兑换不能再次退款。", 409);
        const refund = await tx.coinTransaction.create({
          data: { childId: item.childId, amount: item.actualCost, type: "REWARD_REFUND", reason: `取消兑换：${item.rewardTitleSnapshot}；${reason}`, sourceType: "redemption", sourceId: item.id, idempotencyKey: `refund:${item.id}` }
        });
        return tx.redemption.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason, refundTransactionId: refund.id } });
      });
    }
    case "saveReview": {
      const { child } = await familyAndChild();
      const weekStart = text(input.weekStart, "weekStart", 10);
      const weekEnd = addDays(weekStart, 6);
      return prisma.weeklyReview.upsert({
        where: { childId_weekStart: { childId: child.id, weekStart } },
        update: { wins: String(input.wins ?? "").slice(0, 1000), difficulties: String(input.difficulties ?? "").slice(0, 1000), nextFocus: String(input.nextFocus ?? "").slice(0, 1000) },
        create: { childId: child.id, weekStart, weekEnd, wins: String(input.wins ?? "").slice(0, 1000), difficulties: String(input.difficulties ?? "").slice(0, 1000), nextFocus: String(input.nextFocus ?? "").slice(0, 1000) }
      });
    }
    case "saveSettings": {
      const timezone = text(input.timezone, "timezone", 60);
      if (!isValidTimezone(timezone)) throw new AppError("INVALID_TIMEZONE", "家庭时区无效。", 400);
      return prisma.familySetting.update({
        where: { id: 1 },
        data: { familyName: text(input.familyName, "familyName", 30), timezone, animationsEnabled: bool(input.animationsEnabled), allowBackfill: bool(input.allowBackfill), heroMessagesJson: serializeHeroMessages(input.heroMessages) }
      });
    }
    case "resetBusinessData": {
      const scope = String(input.scope ?? "");
      const idempotencyKey = typeof input.idempotencyKey === "string" && input.idempotencyKey.length <= 100 ? input.idempotencyKey : "";
      const pin = typeof input.pin === "string" ? input.pin : "";
      if (!["task", "reward", "review", "all"].includes(scope) || !idempotencyKey) throw new AppError("INVALID_RESET", "请选择有效的重置范围。", 400);
      if (input.confirmation !== "确认重置") throw new AppError("RESET_CONFIRMATION_REQUIRED", "请输入“确认重置”。", 400);
      const family = await prisma.familySetting.findUnique({ where: { id: 1 } });
      if (!family || !(await verifyPin(pin, family.parentPinSalt, family.parentPinHash))) throw new AppError("INVALID_PIN", "当前 PIN 不正确。", 403);
      if (await prisma.adminOperation.findUnique({ where: { idempotencyKey } })) return;
      await saveServerBackup(`pre-reset-${scope}`);
      return prisma.$transaction(async (tx) => {
        if (await tx.adminOperation.findUnique({ where: { idempotencyKey } })) return;
        if (scope === "task") {
          const targetId = clampInt(input.targetId, 1, Number.MAX_SAFE_INTEGER);
          if (!targetId) throw new AppError("INVALID_RESET", "请选择需要重置的任务。", 400);
          const ids = (await tx.completion.findMany({ where: { taskId: targetId }, select: { id: true } })).map((item) => item.id);
          if (ids.length) {
            await tx.coinTransaction.deleteMany({ where: { completionId: { in: ids } } });
            await tx.completion.deleteMany({ where: { id: { in: ids } } });
          }
        } else if (scope === "reward") {
          const targetId = clampInt(input.targetId, 1, Number.MAX_SAFE_INTEGER);
          if (!targetId) throw new AppError("INVALID_RESET", "请选择需要重置的奖励。", 400);
          const ids = (await tx.redemption.findMany({ where: { rewardId: targetId }, select: { id: true } })).map((item) => item.id);
          if (ids.length) {
            await tx.coinTransaction.deleteMany({ where: { sourceType: "redemption", sourceId: { in: ids } } });
            await tx.redemption.deleteMany({ where: { id: { in: ids } } });
          }
        } else if (scope === "review") {
          const weekStart = typeof input.weekStart === "string" ? input.weekStart : "";
          if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new AppError("INVALID_RESET", "请选择需要删除的周复盘。", 400);
          await tx.weeklyReview.deleteMany({ where: { weekStart } });
        } else {
          await tx.coinTransaction.deleteMany();
          await tx.redemption.deleteMany();
          await tx.completion.deleteMany();
          await tx.weeklyReview.deleteMany();
        }
        await tx.adminOperation.create({ data: { idempotencyKey, action: `resetBusinessData:${scope}` } });
      });
    }
    case "changePin": {
      const oldPin = typeof input.oldPin === "string" ? input.oldPin : "";
      const pin = typeof input.pin === "string" ? input.pin : "";
      const family = await prisma.familySetting.findUnique({ where: { id: 1 } });
      if (!family || !(await verifyPin(oldPin, family.parentPinSalt, family.parentPinHash))) {
        throw new AppError("INVALID_PIN", "当前 PIN 不正确。", 403);
      }
      if (!/^\d{4,6}$/.test(pin)) throw new AppError("INVALID_PIN", "PIN 必须是 4 至 6 位数字。", 400);
      const value = await hashPin(pin);
      await prisma.parentSession.updateMany({ data: { revokedAt: new Date() } });
      return prisma.familySetting.update({ where: { id: 1 }, data: { parentPinHash: value.hash, parentPinSalt: value.salt } });
    }
    case "backfill":
      return completeTask(input, { parent: true });
    default:
      throw new AppError("UNKNOWN_ACTION", "不支持的家长操作。", 400);
  }
}
