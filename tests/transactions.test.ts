import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { businessDate, weekdayForDateKey } from "../lib/domain";

const dbPath = "prisma/test-family-star-coin.db";
const env = { ...process.env, DATABASE_URL: "file:./test-family-star-coin.db" };
let prisma: (typeof import("../lib/prisma"))["prisma"];
let completeTask: (typeof import("../lib/service"))["completeTask"];
let redeemReward: (typeof import("../lib/service"))["redeemReward"];
let runAdminAction: (typeof import("../lib/service"))["runAdminAction"];

beforeAll(async () => {
  for (const path of [dbPath, `${dbPath}-journal`]) if (existsSync(path)) rmSync(path, { force: true });
  writeFileSync(dbPath, "");
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npx.cmd prisma db push --skip-generate"], { env, stdio: "pipe" });
  } else {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { env, stdio: "pipe" });
  }
  process.env.DATABASE_URL = env.DATABASE_URL;
  ({ prisma } = await import("../lib/prisma"));
  ({ completeTask, redeemReward, runAdminAction } = await import("../lib/service"));
  await prisma.familySetting.create({ data: { id: 1, familyName: "测试家庭", timezone: "Asia/Hong_Kong", parentPinHash: "x", parentPinSalt: "y" } });
  await prisma.child.create({ data: { nickname: "测试孩子" } });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  for (const path of [dbPath, `${dbPath}-journal`]) if (existsSync(path)) rmSync(path, { force: true });
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

  it("keeps the historical task snapshot after rule changes", async () => {
    const completion = await prisma.completion.findFirstOrThrow({ where: { taskTitleSnapshot: "阅读" } });
    await prisma.task.update({ where: { id: completion.taskId }, data: { title: "新的阅读规则", points: 2 } });
    const historical = await prisma.completion.findUniqueOrThrow({ where: { id: completion.id } });
    expect(historical.taskTitleSnapshot).toBe("阅读");
    expect(historical.pointsAwarded).toBe(3);
  });
});
