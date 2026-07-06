import { imageAssets } from "@/lib/assets";
import { addDaysKey, formatDate, hongKongDateStart, todayKey, weekRange } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { WeeklyBadgeView, WeeklyReviewView, WeeklySummaryView } from "@/lib/types";

const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

async function getDefaultChild() {
  const child = await prisma.child.findFirst({ orderBy: { id: "asc" } });

  if (!child) {
    throw new Error("No child profile found. Run npm run db:init first.");
  }

  return child;
}

function longestStreak(days: boolean[]) {
  let longest = 0;
  let current = 0;

  for (const hasCompletion of days) {
    current = hasCompletion ? current + 1 : 0;
    longest = Math.max(longest, current);
  }

  return longest;
}

function buildBadges(input: {
  longestStreak: number;
  taskCompletions: number;
  coinsEarned: number;
  deliveredRewards: number;
  completedTitles: string[];
}): WeeklyBadgeView[] {
  return [
    {
      key: "streak",
      title: "连续坚持",
      description: input.longestStreak >= 3 ? "连续完成日程任务" : "连续 3 天完成任务可点亮",
      imageUrl: imageAssets.badges.streak,
      active: input.longestStreak >= 3
    },
    {
      key: "task-champion",
      title: "任务小能手",
      description: input.taskCompletions >= 5 ? "本周任务完成很稳定" : "完成 5 个任务可点亮",
      imageUrl: imageAssets.badges.taskChampion,
      active: input.taskCompletions >= 5
    },
    {
      key: "coin-saver",
      title: "星币积累中",
      description: input.coinsEarned >= 15 ? "星币积累很棒" : "本周获得 15 星币可点亮",
      imageUrl: imageAssets.badges.coinSaver,
      active: input.coinsEarned >= 15
    },
    {
      key: "reward-delivered",
      title: "奖励兑现",
      description: input.deliveredRewards > 0 ? "奖励已经完成兑现" : "兑现一次奖励可点亮",
      imageUrl: imageAssets.badges.rewardDelivered,
      active: input.deliveredRewards > 0
    },
    {
      key: "tidy",
      title: "整洁达人",
      description: "完成整理类任务可点亮",
      imageUrl: imageAssets.badges.tidy,
      active: input.completedTitles.some((title) => title.includes("整理"))
    },
    {
      key: "thinking",
      title: "独立思考",
      description: "完成思考类任务可点亮",
      imageUrl: imageAssets.badges.thinking,
      active: input.completedTitles.some((title) => title.includes("思考") || title.includes("难题"))
    }
  ];
}

export async function getWeeklyReviewState(weekStartInput?: string): Promise<WeeklyReviewView> {
  const child = await getDefaultChild();
  const { weekStart, weekEnd, weekEndExclusive } = weekRange(weekStartInput || todayKey());
  const days = Array.from({ length: 7 }, (_, index) => addDaysKey(weekStart, index));
  const startDate = hongKongDateStart(weekStart);
  const endDate = hongKongDateStart(weekEndExclusive);

  const [completions, ledger, redemptions, review] = await Promise.all([
    prisma.taskCompletion.findMany({
      where: {
        childId: child.id,
        date: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      orderBy: { completedAt: "asc" },
      include: { task: true }
    }),
    prisma.coinLedger.findMany({
      where: {
        childId: child.id,
        createdAt: {
          gte: startDate,
          lt: endDate
        }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.redemption.findMany({
      where: {
        childId: child.id,
        requestedAt: {
          gte: startDate,
          lt: endDate
        }
      },
      orderBy: { requestedAt: "desc" },
      include: { reward: true }
    }),
    prisma.weeklyReview.findUnique({
      where: {
        childId_weekStart: {
          childId: child.id,
          weekStart
        }
      }
    })
  ]);

  const completionByDate = new Map(days.map((date) => [date, 0]));
  const earnedByDate = new Map(days.map((date) => [date, 0]));
  const taskMap = new Map<number, { title: string; count: number; points: number }>();

  for (const completion of completions) {
    completionByDate.set(completion.date, (completionByDate.get(completion.date) ?? 0) + 1);
    const current = taskMap.get(completion.taskId) ?? {
      title: completion.task.title,
      count: 0,
      points: 0
    };
    current.count += 1;
    current.points += completion.pointsAwarded;
    taskMap.set(completion.taskId, current);
  }

  for (const item of ledger) {
    if (item.amount > 0) {
      const key = todayKey(item.createdAt);
      earnedByDate.set(key, (earnedByDate.get(key) ?? 0) + item.amount);
    }
  }

  const daily = days.map((date, index) => ({
    date,
    label: weekLabels[index],
    completionCount: completionByDate.get(date) ?? 0,
    earnedCoins: earnedByDate.get(date) ?? 0
  }));
  const completionDays = daily.map((day) => day.completionCount > 0);
  const completedDays = completionDays.filter(Boolean).length;
  const taskCompletions = completions.length;
  const coinsEarned = ledger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const coinsSpent = Math.abs(
    ledger.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0)
  );
  const deliveredRewards = redemptions.filter((item) => item.status === "delivered").length;
  const pendingRewards = redemptions.filter((item) => item.status === "requested").length;
  const requestedRewards = redemptions.length;
  const streak = longestStreak(completionDays);
  const completedTitles = completions.map((completion) => completion.task.title);

  return {
    weekStart,
    weekEnd,
    completedDays,
    taskCompletions,
    coinsEarned,
    coinsSpent,
    pendingRewards,
    deliveredRewards,
    requestedRewards,
    longestStreak: streak,
    badges: buildBadges({
      longestStreak: streak,
      taskCompletions,
      coinsEarned,
      deliveredRewards,
      completedTitles
    }),
    daily,
    taskRanking: Array.from(taskMap.entries())
      .map(([taskId, task]) => ({
        taskId,
        title: task.title,
        count: task.count,
        points: task.points
      }))
      .sort((a, b) => b.count - a.count || b.points - a.points)
      .slice(0, 6),
    review: {
      observation: review?.observation ?? "",
      nextFocus: review?.nextFocus ?? ""
    }
  };
}

export async function getWeeklySummary(date = todayKey()): Promise<WeeklySummaryView> {
  const review = await getWeeklyReviewState(date);
  const { taskRanking: _taskRanking, review: _review, ...summary } = review;

  return summary;
}

export async function saveWeeklyReview(input: {
  weekStart: string;
  observation: string;
  nextFocus: string;
}) {
  const child = await getDefaultChild();
  const { weekStart, weekEnd } = weekRange(input.weekStart);

  return prisma.weeklyReview.upsert({
    where: {
      childId_weekStart: {
        childId: child.id,
        weekStart
      }
    },
    update: {
      weekEnd,
      observation: input.observation,
      nextFocus: input.nextFocus
    },
    create: {
      childId: child.id,
      weekStart,
      weekEnd,
      observation: input.observation,
      nextFocus: input.nextFocus
    }
  });
}
