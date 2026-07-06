import { prisma } from "@/lib/prisma";
import { todayKey } from "@/lib/dates";
import { rewardDefaultImage } from "@/lib/assets";
import { getWeeklySummary } from "@/lib/weekly-review";
import type {
  AdminState,
  AppState,
  CompletionRecordView,
  LedgerRecordView,
  RedemptionRecordView,
  RewardView,
  ScheduleBlockView,
  TaskView
} from "@/lib/types";

async function getDefaultChild() {
  const child = await prisma.child.findFirst({ orderBy: { id: "asc" } });

  if (!child) {
    throw new Error("No child profile found. Run npm run db:init first.");
  }

  return child;
}

function mapTasks(
  tasks: Array<{
    id: number;
    title: string;
    description: string;
    points: number;
    enabled: boolean;
    sortOrder: number;
  }>,
  completedTaskIds: Set<number>
): TaskView[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    points: task.points,
    enabled: task.enabled,
    sortOrder: task.sortOrder,
    completedToday: completedTaskIds.has(task.id)
  }));
}

function mapRewards(
  rewards: Array<{
    id: number;
    title: string;
    description: string;
    cost: number;
    tier: string;
    category: string;
    imageUrl: string | null;
    enabled: boolean;
    sortOrder: number;
  }>,
  coinBalance: number
): RewardView[] {
  return rewards.map((reward) => ({
    id: reward.id,
    title: reward.title,
    description: reward.description,
    cost: reward.cost,
    tier: reward.tier,
    category: reward.category,
    imageUrl: reward.imageUrl,
    defaultImageUrl: rewardDefaultImage(reward.category, reward.sortOrder),
    enabled: reward.enabled,
    sortOrder: reward.sortOrder,
    canRedeem: coinBalance >= reward.cost
  }));
}

function mapCompletions(
  completions: Array<{
    id: number;
    date: string;
    completedAt: Date;
    pointsAwarded: number;
    task: { title: string };
  }>
): CompletionRecordView[] {
  return completions.map((completion) => ({
    id: completion.id,
    title: completion.task.title,
    pointsAwarded: completion.pointsAwarded,
    date: completion.date,
    completedAt: completion.completedAt.toISOString()
  }));
}

function mapRedemptions(
  redemptions: Array<{
    id: number;
    cost: number;
    status: string;
    requestedAt: Date;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
    reward: { title: string };
  }>
): RedemptionRecordView[] {
  return redemptions.map((redemption) => ({
    id: redemption.id,
    title: redemption.reward.title,
    cost: redemption.cost,
    status: redemption.status,
    requestedAt: redemption.requestedAt.toISOString(),
    deliveredAt: redemption.deliveredAt?.toISOString() ?? null,
    cancelledAt: redemption.cancelledAt?.toISOString() ?? null
  }));
}

function mapLedger(
  ledger: Array<{
    id: number;
    amount: number;
    reason: string;
    sourceType: string;
    createdAt: Date;
  }>
): LedgerRecordView[] {
  return ledger.map((item) => ({
    id: item.id,
    amount: item.amount,
    reason: item.reason,
    sourceType: item.sourceType,
    createdAt: item.createdAt.toISOString()
  }));
}

function buildSchedule(
  blocks: Array<{
    id: number;
    startTime: string;
    endTime: string;
    title: string;
    description: string;
    type: string;
    sortOrder: number;
    taskId: number | null;
    task: { title: string; points: number } | null;
  }>,
  overrides: Array<{
    id: number;
    blockId: number | null;
    action: string;
    startTime: string | null;
    endTime: string | null;
    title: string | null;
    description: string | null;
    type: string | null;
    taskId: number | null;
    sortOrder: number | null;
  }>,
  taskLookup: Map<number, { title: string; points: number }>,
  completedTaskIds: Set<number>
): ScheduleBlockView[] {
  const hidden = new Set(
    overrides
      .filter((override) => override.action === "hide" && override.blockId)
      .map((override) => override.blockId as number)
  );
  const updates = new Map(
    overrides
      .filter((override) => override.action === "update" && override.blockId)
      .map((override) => [override.blockId as number, override])
  );

  const schedule: ScheduleBlockView[] = blocks
    .filter((block) => !hidden.has(block.id))
    .map((block) => {
      const update = updates.get(block.id);
      const taskId = update?.taskId ?? block.taskId;
      const task = taskId ? taskLookup.get(taskId) ?? block.task : block.task;

      return {
        id: `block-${block.id}`,
        sourceId: block.id,
        startTime: update?.startTime ?? block.startTime,
        endTime: update?.endTime ?? block.endTime,
        title: update?.title ?? block.title,
        description: update?.description ?? block.description,
        type: update?.type ?? block.type,
        sortOrder: update?.sortOrder ?? block.sortOrder,
        taskId,
        taskTitle: task?.title ?? null,
        points: task?.points ?? null,
        completedToday: taskId ? completedTaskIds.has(taskId) : false
      };
    });

  overrides
    .filter((override) => override.action === "add")
    .forEach((override) => {
      const task = override.taskId ? taskLookup.get(override.taskId) : null;
      schedule.push({
        id: `override-${override.id}`,
        sourceId: null,
        startTime: override.startTime ?? "18:00",
        endTime: override.endTime ?? "18:20",
        title: override.title ?? "临时安排",
        description: override.description ?? "家长今天加的小安排",
        type: override.type ?? "routine",
        sortOrder: override.sortOrder ?? 99,
        taskId: override.taskId,
        taskTitle: task?.title ?? null,
        points: task?.points ?? null,
        completedToday: override.taskId ? completedTaskIds.has(override.taskId) : false
      });
    });

  return schedule.sort((a, b) => {
    if (a.startTime === b.startTime) {
      return a.sortOrder - b.sortOrder;
    }

    return a.startTime.localeCompare(b.startTime);
  });
}

export async function getAppState(date = todayKey()): Promise<AppState> {
  const child = await getDefaultChild();
  const [
    tasks,
    rewards,
    template,
    completions,
    redemptions,
    ledger,
    overrides
  ] = await Promise.all([
    prisma.taskTemplate.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.reward.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.scheduleTemplate.findFirst({
      where: { enabled: true },
      orderBy: { id: "asc" },
      include: {
        blocks: {
          where: { enabled: true },
          orderBy: [{ startTime: "asc" }, { sortOrder: "asc" }],
          include: { task: true }
        }
      }
    }),
    prisma.taskCompletion.findMany({
      where: { childId: child.id, date },
      orderBy: { completedAt: "desc" },
      include: { task: true }
    }),
    prisma.redemption.findMany({
      where: { childId: child.id },
      orderBy: { requestedAt: "desc" },
      take: 8,
      include: { reward: true }
    }),
    prisma.coinLedger.findMany({
      where: { childId: child.id },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.dailyScheduleOverride.findMany({
      where: { date },
      orderBy: { sortOrder: "asc" }
    })
  ]);

  const completedTaskIds = new Set(completions.map((completion) => completion.taskId));
  const taskLookup = new Map(tasks.map((task) => [task.id, task]));
  const taskViews = mapTasks(tasks, completedTaskIds);
  const rewardViews = mapRewards(rewards, child.coinBalance);
  const weeklySummary = await getWeeklySummary(date);
  const targetReward =
    rewardViews.find((reward) => reward.cost >= child.coinBalance && reward.enabled) ??
    rewardViews.find((reward) => reward.enabled) ??
    null;

  return {
    today: date,
    child: {
      id: child.id,
      name: child.name,
      avatar: child.avatar,
      coinBalance: child.coinBalance
    },
    targetReward,
    schedule: buildSchedule(
      template?.blocks ?? [],
      overrides,
      taskLookup,
      completedTaskIds
    ),
    tasks: taskViews,
    rewards: rewardViews,
    weeklySummary,
    recent: {
      completions: mapCompletions(completions),
      redemptions: mapRedemptions(redemptions),
      ledger: mapLedger(ledger)
    }
  };
}

export async function getAdminState(date = todayKey()): Promise<AdminState> {
  const appState = await getAppState(date);
  const [templates, overrides] = await Promise.all([
    prisma.scheduleTemplate.findMany({
      orderBy: { id: "asc" },
      include: {
        blocks: {
          orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }]
        }
      }
    }),
    prisma.dailyScheduleOverride.findMany({
      orderBy: [{ date: "desc" }, { sortOrder: "asc" }],
      take: 20
    })
  ]);

  return {
    ...appState,
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      weekdays: template.weekdays,
      enabled: template.enabled,
      blocks: template.blocks.map((block) => ({
        id: block.id,
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        description: block.description,
        type: block.type,
        taskId: block.taskId,
        enabled: block.enabled,
        sortOrder: block.sortOrder
      }))
    })),
    overrides: overrides.map((override) => ({
      id: override.id,
      date: override.date,
      action: override.action,
      title: override.title,
      startTime: override.startTime,
      endTime: override.endTime
    }))
  };
}
