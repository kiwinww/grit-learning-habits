import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { businessDate, weekdayForDateKey } from "../lib/domain";

const dbPath = "prisma/test-family-star-coin.db";
const backupPath = "prisma/test-backups";
const env = { ...process.env, DATABASE_URL: "file:./test-family-star-coin.db" };
let prisma: (typeof import("../lib/prisma"))["prisma"];
let completeTask: (typeof import("../lib/service"))["completeTask"];
let redeemReward: (typeof import("../lib/service"))["redeemReward"];
let runAdminAction: (typeof import("../lib/service"))["runAdminAction"];
let cancelPendingCompletion: (typeof import("../lib/service"))["cancelPendingCompletion"];
let getAdminAlertState: (typeof import("../lib/state"))["getAdminAlertState"];
let getChildState: (typeof import("../lib/state"))["getChildState"];

beforeAll(async () => {
  for (const path of [dbPath, `${dbPath}-journal`]) if (existsSync(path)) rmSync(path, { force: true });
  writeFileSync(dbPath, "");
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npx.cmd prisma db push --skip-generate"], { env, stdio: "pipe" });
  } else {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { env, stdio: "pipe" });
  }
  process.env.DATABASE_URL = env.DATABASE_URL;
  process.env.BACKUP_DIR = backupPath;
  ({ prisma } = await import("../lib/prisma"));
  ({ completeTask, redeemReward, runAdminAction, cancelPendingCompletion } = await import("../lib/service"));
  ({ getAdminAlertState, getChildState } = await import("../lib/state"));
  const { hashPin } = await import("../lib/security");
  const pin = await hashPin("2468");
  await prisma.familySetting.create({ data: { id: 1, familyName: "测试家庭", timezone: "Asia/Hong_Kong", parentPinHash: pin.hash, parentPinSalt: pin.salt } });
  await prisma.child.create({ data: { nickname: "测试孩子" } });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  for (const path of [dbPath, `${dbPath}-journal`]) if (existsSync(path)) rmSync(path, { force: true });
  if (existsSync(backupPath)) rmSync(backupPath, { force: true, recursive: true });
});

describe("transaction invariants", () => {
  it("does not award a task twice on repeated submission", async () => {
    const task = await prisma.task.create({ data: { title: "阅读", childDescription: "阅读二十分钟", points: 3 } });
    const today = businessDate();
    await prisma.schedule.create({ data: { taskId: task.id, title: task.title, description: task.childDescription, weekday: weekdayForDateKey(today), startTime: "00:00", endTime: "23:59" } });
    await completeTask({ taskId: task.id, idempotencyKey: "first-click" });
    await completeTask({ taskId: task.id, idempotencyKey: "second-click" });
    expect(await prisma.completion.count({ where: { taskId: task.id, businessDate: today } })).toBe(1);
    expect(await prisma.coinTransaction.aggregate({ where: { type: "TASK_EARN" }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 3 } });
  });

  it("redeems and refunds exactly once", async () => {
    const child = await prisma.child.findFirstOrThrow();
    await prisma.coinTransaction.create({ data: { childId: child.id, amount: 20, type: "SPECIAL_EVENT", reason: "测试奖励", sourceType: "test", idempotencyKey: "test-bonus" } });
    const reward = await prisma.reward.create({ data: { title: "早餐选择", description: "选择周末早餐", cost: 15 } });
    const redemption = await redeemReward({ rewardId: reward.id, idempotencyKey: "redeem-once" });
    expect(redemption?.actualCost).toBe(15);
    await runAdminAction({ action: "cancelRedemption", id: redemption?.id, reason: "计划改变" });
    await expect(runAdminAction({ action: "cancelRedemption", id: redemption?.id, reason: "重复退款" })).rejects.toMatchObject({ code: "INVALID_REDEMPTION" });
    const balance = await prisma.coinTransaction.aggregate({ where: { childId: child.id }, _sum: { amount: true } });
    expect(balance._sum.amount).toBe(23);
  });

  it("returns new pending redemptions for the parent alert feed", async () => {
    const reward = await prisma.reward.create({ data: { title: "亲子散步", description: "一起走一条喜欢的路线", cost: 5 } });
    const redemption = await redeemReward({ rewardId: reward.id, idempotencyKey: "alert-feed-redeem" });
    const alerts = await getAdminAlertState();
    expect(alerts.authenticated).toBe(true);
    expect(alerts.pendingCount).toBeGreaterThanOrEqual(1);
    expect(alerts.redemptions[0]).toMatchObject({ id: redemption?.id, title: "亲子散步", cost: 5, status: "pending" });
  });

  it("keeps the historical task snapshot after rule changes", async () => {
    const completion = await prisma.completion.findFirstOrThrow({ where: { taskTitleSnapshot: "阅读" } });
    await prisma.task.update({ where: { id: completion.taskId }, data: { title: "新的阅读规则", points: 2 } });
    const historical = await prisma.completion.findUniqueOrThrow({ where: { id: completion.id } });
    expect(historical.taskTitleSnapshot).toBe("阅读");
    expect(historical.pointsAwarded).toBe(3);
  });

  it("saves a task and all of its schedules in one transaction", async () => {
    await expect(runAdminAction({
      action: "saveTaskPlan",
      title: "事务任务失败",
      childDescription: "无效时间不应留下任务",
      points: 2,
      enabled: true,
      schedules: [{ scheduleType: "weekly", weekdays: [1], startTime: "19:30", endTime: "18:30", reminder: true }]
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await prisma.task.count({ where: { title: "事务任务失败" } })).toBe(0);

    await runAdminAction({
      action: "saveTaskPlan",
      title: "统一任务计划",
      childDescription: "任务和安排一起保存",
      points: 5,
      requiresApproval: true,
      enabled: true,
      schedules: [
        { scheduleType: "weekly", weekdays: [1, 3], startTime: "18:30", endTime: "18:50", reminder: true },
        { scheduleType: "date", specificDate: "2026-07-20", startTime: "10:00", endTime: "10:20", reminder: false }
      ]
    });
    const task = await prisma.task.findFirstOrThrow({ where: { title: "统一任务计划" } });
    expect(await prisma.schedule.count({ where: { taskId: task.id } })).toBe(3);
    expect(await prisma.schedule.findMany({ where: { taskId: task.id }, orderBy: { sortOrder: "asc" } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "统一任务计划", description: "任务和安排一起保存", weekday: 1 }),
      expect.objectContaining({ title: "统一任务计划", description: "任务和安排一起保存", weekday: 3 }),
      expect.objectContaining({ title: "统一任务计划", description: "任务和安排一起保存", specificDate: "2026-07-20" })
    ]));
  });

  it("uses current task data in the child state and hides disabled task schedules", async () => {
    const weekday = weekdayForDateKey(businessDate());
    await runAdminAction({
      action: "saveTaskPlan",
      title: "联动前标题",
      childDescription: "联动前说明",
      points: 2,
      enabled: true,
      schedules: [
        { scheduleType: "weekly", weekdays: [weekday], startTime: "08:00", endTime: "08:20", reminder: true },
        { scheduleType: "weekly", weekdays: [weekday], startTime: "20:00", endTime: "20:20", reminder: true }
      ]
    });
    const task = await prisma.task.findFirstOrThrow({ where: { title: "联动前标题" } });
    await prisma.task.update({ where: { id: task.id }, data: { title: "联动后标题", childDescription: "联动后说明", points: 7 } });

    const childState = await getChildState();
    expect(childState.schedule.filter((item) => item.taskId === task.id)).toEqual([
      expect.objectContaining({ title: "联动后标题", description: "联动后说明", points: 7, startTime: "08:00" })
    ]);

    await prisma.task.update({ where: { id: task.id }, data: { enabled: false } });
    expect((await getChildState()).schedule.some((item) => item.taskId === task.id)).toBe(false);
  });

  it("keeps hidden legacy task fields when saving the unified task plan", async () => {
    const task = await prisma.task.create({ data: { title: "旧任务字段", childDescription: "保留旧配置", points: 2, isCore: true, habitStage: "stable" } });
    await runAdminAction({
      action: "saveTaskPlan",
      id: task.id,
      title: "旧任务字段已更新",
      childDescription: "常用字段已经更新",
      points: 3,
      enabled: true,
      schedules: [{ scheduleType: "weekly", weekdays: [2], startTime: "17:00", endTime: "17:20", reminder: true }]
    });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ isCore: true, habitStage: "stable" });
  });

  it("preserves hidden reward limits and category when editing", async () => {
    const reward = await prisma.reward.create({ data: { title: "旧奖励设置", description: "保留隐藏字段", cost: 9, category: "选择权", dailyLimit: 1, weeklyLimit: 2 } });
    await runAdminAction({ action: "saveReward", id: reward.id, title: "新奖励名称", description: "只修改常用字段", cost: 10, enabled: true });
    expect(await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } })).toMatchObject({ category: "选择权", dailyLimit: 1, weeklyLimit: 2 });
  });

  it("lets a child cancel only a pending completion and complete it again", async () => {
    const task = await prisma.task.create({ data: { title: "整理书包", childDescription: "把明天要用的东西放好", points: 2, requiresApproval: true } });
    const today = businessDate();
    await prisma.schedule.create({ data: { taskId: task.id, title: task.title, description: task.childDescription, weekday: weekdayForDateKey(today), startTime: "00:00", endTime: "23:59" } });
    const first = await completeTask({ taskId: task.id, idempotencyKey: "pending-first" });
    expect(first?.status).toBe("pending");
    await cancelPendingCompletion({ completionId: first?.id, idempotencyKey: "cancel-pending-first" });
    expect(await prisma.completion.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.coinTransaction.count({ where: { completionId: first?.id } })).toBe(0);
    const second = await completeTask({ taskId: task.id, idempotencyKey: "pending-second" });
    expect(second?.status).toBe("pending");
  });

  it("rejects child cancellation after coins were approved", async () => {
    const approved = await prisma.completion.findFirstOrThrow({ where: { status: "approved" } });
    await expect(cancelPendingCompletion({ completionId: approved.id, idempotencyKey: "cancel-approved" })).rejects.toMatchObject({ code: "CANCEL_NOT_ALLOWED" });
  });

  it("allows a revoked task to be completed again while keeping its ledger history", async () => {
    const task = await prisma.task.create({ data: { title: "撤销后重做", childDescription: "重新完成今天的任务", points: 3 } });
    const today = businessDate();
    await prisma.schedule.create({ data: { taskId: task.id, title: task.title, description: task.childDescription, weekday: weekdayForDateKey(today), startTime: "00:00", endTime: "23:59" } });
    const first = await completeTask({ taskId: task.id, idempotencyKey: "redo-first" });
    await runAdminAction({ action: "revokeCompletion", id: first?.id, reason: "需要重新完成", allowNegative: true });
    const second = await completeTask({ taskId: task.id, idempotencyKey: "redo-second" });

    expect(second?.id).toBe(first?.id);
    expect(await prisma.completion.findUniqueOrThrow({ where: { id: first!.id } })).toMatchObject({ status: "approved", revokeReason: null, revokedAt: null });
    expect(await prisma.completion.count({ where: { taskId: task.id, businessDate: today } })).toBe(1);
    expect(await prisma.coinTransaction.aggregate({ where: { completionId: { in: [first!.id, second!.id] }, type: "TASK_EARN" }, _sum: { amount: true } })).toMatchObject({ _sum: { amount: 6 } });
    expect(await prisma.coinTransaction.count({ where: { completionId: first!.id, type: "COMPLETION_REVERSAL" } })).toBe(1);
  });

  it("soft deletes task and reward configuration while keeping history", async () => {
    const task = await prisma.task.findFirstOrThrow({ where: { completions: { some: {} }, deletedAt: null } });
    const completionCount = await prisma.completion.count({ where: { taskId: task.id } });
    await runAdminAction({ action: "deleteTask", id: task.id });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ enabled: false });
    expect(await prisma.schedule.count({ where: { taskId: task.id, enabled: true } })).toBe(0);
    expect(await prisma.completion.count({ where: { taskId: task.id } })).toBe(completionCount);

    const reward = await prisma.reward.findFirstOrThrow();
    await prisma.familySetting.update({ where: { id: 1 }, data: { targetRewardId: reward.id } });
    await runAdminAction({ action: "deleteReward", id: reward.id });
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: reward.id } })).deletedAt).toBeInstanceOf(Date);
    expect((await prisma.familySetting.findUniqueOrThrow({ where: { id: 1 } })).targetRewardId).toBeNull();
  });

  it("backs up and resets one task idempotently", async () => {
    const task = await prisma.task.create({ data: { title: "重置测试", childDescription: "测试历史重置", points: 4 } });
    const child = await prisma.child.findFirstOrThrow();
    const completion = await prisma.completion.create({ data: { childId: child.id, taskId: task.id, businessDate: "2026-07-01", status: "approved", pointsAwarded: 4, taskTitleSnapshot: task.title, taskDetailsSnapshot: task.childDescription, approvedAt: new Date(), idempotencyKey: "reset-fixture" } });
    await prisma.coinTransaction.create({ data: { childId: child.id, amount: 4, type: "TASK_EARN", reason: "测试", sourceType: "completion", sourceId: completion.id, completionId: completion.id, idempotencyKey: "reset-award" } });
    const payload = { action: "resetBusinessData", scope: "task", targetId: task.id, pin: "2468", confirmation: "确认重置", idempotencyKey: "reset-task-once" };
    await runAdminAction(payload);
    await runAdminAction(payload);
    expect(await prisma.completion.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.coinTransaction.count({ where: { completionId: completion.id } })).toBe(0);
    expect(existsSync(backupPath)).toBe(true);
  });
});
