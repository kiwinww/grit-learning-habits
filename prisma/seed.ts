import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPin } from "../lib/security";
import { addDays, businessDate, weekBounds } from "../lib/domain";

const prisma = new PrismaClient();

async function main() {
  if (process.env.DEMO_SEED !== "1") {
    console.log("DEMO_SEED is not 1; leaving the fresh database empty.");
    return;
  }
  if (await prisma.familySetting.findUnique({ where: { id: 1 } })) {
    console.log("Demo family already exists; skipping seed.");
    return;
  }
  const pin = await hashPin(process.env.DEMO_PARENT_PIN ?? "2468");
  const today = businessDate();
  const week = weekBounds(today);

  await prisma.familySetting.create({
    data: { id: 1, familyName: "星光小屋", timezone: "Asia/Hong_Kong", parentPinHash: pin.hash, parentPinSalt: pin.salt }
  });
  const child = await prisma.child.create({ data: { nickname: "小树苗" } });
  const tasks = await Promise.all([
    prisma.task.create({ data: { title: "专心阅读", childDescription: "选一本喜欢的书，安静读 20 分钟。", category: "learning", points: 3, isCore: true, sortOrder: 1 } }),
    prisma.task.create({ data: { title: "整理书包", childDescription: "按明天的课程把书本和文具放好。", category: "routine", points: 2, sortOrder: 2 } }),
    prisma.task.create({ data: { title: "错题回顾", childDescription: "选两道错题，说一说哪里容易出错。", category: "learning", points: 4, requiresApproval: true, isCore: true, sortOrder: 3 } })
  ]);
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    await prisma.schedule.createMany({ data: [
      { taskId: tasks[0].id, title: tasks[0].title, description: tasks[0].childDescription, weekday, startTime: "17:20", endTime: "17:40", sortOrder: 1 },
      { taskId: tasks[1].id, title: tasks[1].title, description: tasks[1].childDescription, weekday, startTime: "20:10", endTime: "20:20", sortOrder: 2 },
      { taskId: tasks[2].id, title: tasks[2].title, description: tasks[2].childDescription, weekday, startTime: "20:25", endTime: "20:40", sortOrder: 3 }
    ] });
  }
  await prisma.schedule.create({ data: { title: "自由探索时间", description: "画画、搭积木或到户外看看。", scheduleType: "weekly", weekday: 0, startTime: "15:00", endTime: "16:00", reminder: false } });
  const rewards = await Promise.all([
    prisma.reward.create({ data: { title: "选择周末早餐", description: "由你决定一家人周末早餐吃什么。", cost: 18, category: "选择权", sortOrder: 1 } }),
    prisma.reward.create({ data: { title: "亲子自然散步", description: "一起选一条路线，慢慢走、慢慢聊。", cost: 25, category: "亲子陪伴", sortOrder: 2 } }),
    prisma.reward.create({ data: { title: "家庭手工时间", description: "准备材料，一起完成一个小作品。", cost: 30, category: "体验活动", sortOrder: 3 } })
  ]);
  await prisma.familySetting.update({ where: { id: 1 }, data: { targetRewardId: rewards[1].id } });

  for (let offset = -3; offset <= -1; offset += 1) {
    const date = addDays(today, offset);
    const completion = await prisma.completion.create({ data: { childId: child.id, taskId: tasks[0].id, businessDate: date, status: "approved", pointsAwarded: 3, taskTitleSnapshot: tasks[0].title, taskDetailsSnapshot: tasks[0].childDescription, approvedAt: new Date(), idempotencyKey: `demo:${tasks[0].id}:${date}` } });
    await prisma.coinTransaction.create({ data: { childId: child.id, amount: 3, type: "TASK_EARN", reason: `完成任务：${tasks[0].title}`, sourceType: "completion", sourceId: completion.id, completionId: completion.id, idempotencyKey: `demo-award:${completion.id}` } });
  }
  await prisma.coinTransaction.create({ data: { childId: child.id, amount: 12, type: "SPECIAL_EVENT", reason: "周末主动帮助整理餐桌", sourceType: "family", idempotencyKey: "demo-family-bonus" } });
  await prisma.weeklyReview.create({ data: { childId: child.id, weekStart: week.start, weekEnd: week.end, wins: "开始任务比上周更主动。", difficulties: "错题回顾需要拆成更小步骤。", nextFocus: "先坚持每天阅读二十分钟。" } });
  console.log("Demo preview seeded. Parent PIN:", process.env.DEMO_PARENT_PIN ?? "2468");
}

main().finally(() => prisma.$disconnect());
