import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { businessDate, formatFamilyDate, longestStreak, sumLedger, weekBounds, weekdayForDateKey, addDays, utcForFamilyDate } from "@/lib/domain";
import type { AdminState, ChildState } from "@/lib/contracts";

export async function getChildState(): Promise<ChildState> {
  const family = await prisma.familySetting.findUnique({ where: { id: 1 } });
  const child = await prisma.child.findFirst({ where: { enabled: true }, orderBy: { id: "asc" } });
  if (!family || !child) throw new AppError("NOT_INITIALIZED", "请先完成家庭初始化。", 409);

  const today = businessDate(new Date(), family.timezone);
  const weekday = weekdayForDateKey(today);
  const week = weekBounds(today);
  const [schedules, todayCompletions, rewards, transactions, weekCompletions, recentCompletions, recentRedemptions, allStreakCompletions] =
    await Promise.all([
      prisma.schedule.findMany({
        where: {
          enabled: true,
          OR: [
            { scheduleType: "weekly", weekday },
            { scheduleType: "date", specificDate: today }
          ]
        },
        include: { task: true },
        orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }]
      }),
      prisma.completion.findMany({ where: { childId: child.id, businessDate: today } }),
      prisma.reward.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      prisma.coinTransaction.findMany({ where: { childId: child.id }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.completion.findMany({
        where: { childId: child.id, status: "approved", businessDate: { gte: week.start, lte: week.end } }
      }),
      prisma.completion.findMany({ where: { childId: child.id }, orderBy: { completedAt: "desc" }, take: 12 }),
      prisma.redemption.findMany({ where: { childId: child.id }, orderBy: { requestedAt: "desc" }, take: 12 }),
      prisma.completion.findMany({ where: { childId: child.id, status: "approved", countForStreak: true }, select: { businessDate: true } })
    ]);

  const balance = sumLedger(transactions.length < 30
    ? transactions
    : await prisma.coinTransaction.findMany({ where: { childId: child.id }, select: { amount: true } }));
  const completionByTask = new Map(todayCompletions.map((item) => [item.taskId, item]));
  const weekTransactions = await prisma.coinTransaction.findMany({
    where: {
      childId: child.id,
      createdAt: {
        gte: utcForFamilyDate(week.start, family.timezone),
        lt: utcForFamilyDate(addDays(week.end, 1), family.timezone)
      }
    }
  });
  const completedDays = new Set(weekCompletions.map((item) => item.businessDate)).size;
  const streak = longestStreak(allStreakCompletions.map((item) => item.businessDate));
  const deliveredCount = await prisma.redemption.count({ where: { childId: child.id, status: "fulfilled" } });

  return {
    today,
    todayLabel: formatFamilyDate(today),
    family: { name: family.familyName, timezone: family.timezone, animationsEnabled: family.animationsEnabled, allowBackfill: family.allowBackfill },
    child: { id: child.id, nickname: child.nickname, avatar: child.avatar },
    balance,
    targetRewardId: family.targetRewardId,
    schedule: schedules.map((item) => ({
      id: item.id,
      taskId: item.taskId,
      title: item.title,
      description: item.description,
      startTime: item.startTime,
      endTime: item.endTime,
      reminder: item.reminder,
      points: item.task?.points ?? 0,
      status: item.taskId ? completionByTask.get(item.taskId)?.status ?? null : null
    })),
    rewards: rewards.map((reward) => ({
      id: reward.id,
      title: reward.title,
      description: reward.description,
      cost: reward.cost,
      category: reward.category,
      enabled: reward.enabled,
      hasImage: Boolean(reward.imageData),
      canRedeem: reward.enabled && balance >= reward.cost,
      dailyLimit: reward.dailyLimit,
      weeklyLimit: reward.weeklyLimit
    })),
    weekly: {
      start: week.start,
      end: week.end,
      completedDays,
      completedTasks: weekCompletions.length,
      coinsEarned: weekTransactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
      streak,
      badges: [
        { key: "streak-3", title: "坚持三天", description: "连续完成任务三天", earned: streak >= 3 },
        { key: "five-tasks", title: "任务小达人", description: "本周完成五个任务", earned: weekCompletions.length >= 5 },
        { key: "all-core", title: "核心任务守护者", description: "本周核心任务全部完成", earned: completedDays >= 5 },
        { key: "reward", title: "愿望兑现", description: "完成一次家庭奖励", earned: deliveredCount > 0 }
      ]
    },
    recent: {
      completions: recentCompletions.map((item) => ({ id: item.id, title: item.taskTitleSnapshot, points: item.pointsAwarded, date: item.businessDate, status: item.status })),
      transactions: transactions.slice(0, 12).map((item) => ({ id: item.id, amount: item.amount, reason: item.reason, createdAt: item.createdAt.toISOString() })),
      redemptions: recentRedemptions.map((item) => ({ id: item.id, title: item.rewardTitleSnapshot, cost: item.actualCost, status: item.status, requestedAt: item.requestedAt.toISOString() }))
    }
  };
}

export async function getAdminState(): Promise<AdminState> {
  const childState = await getChildState();
  const [tasks, schedules, pendingCompletions, reviews] = await Promise.all([
    prisma.task.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.schedule.findMany({ orderBy: [{ weekday: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }] }),
    prisma.completion.findMany({ where: { status: "pending" }, orderBy: { completedAt: "desc" } }),
    prisma.weeklyReview.findMany({ orderBy: { weekStart: "desc" }, take: 12 })
  ]);

  const stabilityHints: AdminState["stabilityHints"] = [];
  for (const task of tasks.filter((item) => item.enabled)) {
    const plannedPerWeek = await prisma.schedule.count({ where: { taskId: task.id, enabled: true, scheduleType: "weekly" } });
    const since = addDays(childState.weekly.start, -21);
    const completions = await prisma.completion.findMany({
      where: { taskId: task.id, status: "approved", businessDate: { gte: since, lte: childState.weekly.end } }
    });
    if (plannedPerWeek >= 3 && completions.length / (plannedPerWeek * 4) >= 0.8) {
      stabilityHints.push({ taskId: task.id, title: task.title, message: "已稳定完成四周，可考虑减少星币或改为每周表扬。" });
    }
  }

  return {
    ...childState,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      childDescription: task.childDescription,
      category: task.category,
      points: task.points,
      requiresApproval: task.requiresApproval,
      isCore: task.isCore,
      enabled: task.enabled,
      sortOrder: task.sortOrder,
      habitStage: task.habitStage
    })),
    schedules: schedules.map((item) => ({
      id: item.id,
      taskId: item.taskId,
      title: item.title,
      description: item.description,
      scheduleType: item.scheduleType,
      weekday: item.weekday,
      specificDate: item.specificDate,
      startTime: item.startTime,
      endTime: item.endTime,
      reminder: item.reminder,
      enabled: item.enabled,
      sortOrder: item.sortOrder
    })),
    pendingCompletions: pendingCompletions.map((item) => ({ id: item.id, title: item.taskTitleSnapshot, date: item.businessDate, points: item.pointsAwarded })),
    reviews: reviews.map((item) => ({ weekStart: item.weekStart, weekEnd: item.weekEnd, wins: item.wins, difficulties: item.difficulties, nextFocus: item.nextFocus })),
    stabilityHints
  };
}
