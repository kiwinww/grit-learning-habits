import type {
  AdminState,
  AppState,
  CompletionRecordView,
  LedgerRecordView,
  RedemptionRecordView,
  ScheduleBlockView,
  WeeklyReviewView,
  WeeklySummaryView
} from "@/lib/types";

const STORAGE_KEY = "grit-learning-habits-pages-state-v1";
const weekLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export type StaticPagesSnapshot = {
  page?: "home" | "admin";
  appState: AppState;
  adminState: AdminState;
  weeklyReview: WeeklyReviewView;
};

declare global {
  interface Window {
    __GRIT_PAGES_DATA__?: StaticPagesSnapshot;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nextId(items: Array<{ id: number }>) {
  return Math.max(0, ...items.map((item) => item.id)) + 1;
}

function nowIso() {
  return new Date().toISOString();
}

function addDaysKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function appFromAdmin(adminState: AdminState): AppState {
  const { templates: _templates, overrides: _overrides, ...appState } = adminState;
  return clone(appState);
}

function syncAdminFromApp(adminState: AdminState, appState: AppState): AdminState {
  return {
    ...adminState,
    today: appState.today,
    child: appState.child,
    targetReward: appState.targetReward,
    schedule: appState.schedule,
    tasks: appState.tasks,
    rewards: appState.rewards,
    weeklySummary: appState.weeklySummary,
    recent: appState.recent
  };
}

function summaryFromReview(review: WeeklyReviewView): WeeklySummaryView {
  const { taskRanking: _taskRanking, review: _review, ...summary } = review;
  return summary;
}

function defaultWeeklyReview(appState: AppState): WeeklyReviewView {
  const summary = appState.weeklySummary;
  return {
    ...summary,
    daily: summary.daily.length
      ? summary.daily
      : weekLabels.map((label, index) => ({
          date: addDaysKey(summary.weekStart, index),
          label,
          completionCount: 0,
          earnedCoins: 0
        })),
    taskRanking: [],
    review: {
      observation: "",
      nextFocus: ""
    }
  };
}

function normalizeAppState(appState: AppState): AppState {
  const completedTaskIds = new Set(
    appState.tasks.filter((task) => task.completedToday).map((task) => task.id)
  );
  const coinBalance = Math.max(0, appState.child.coinBalance);
  const rewards = appState.rewards.map((reward) => ({
    ...reward,
    canRedeem: reward.enabled && coinBalance >= reward.cost
  }));
  const targetReward =
    rewards.find((reward) => reward.enabled && reward.cost >= coinBalance) ??
    rewards.find((reward) => reward.enabled) ??
    null;

  return {
    ...appState,
    child: {
      ...appState.child,
      coinBalance
    },
    targetReward,
    tasks: [...appState.tasks].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    schedule: appState.schedule
      .map((block) => ({
        ...block,
        completedToday: block.taskId ? completedTaskIds.has(block.taskId) : false
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder),
    rewards: rewards.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    recent: {
      completions: appState.recent.completions.slice(0, 10),
      redemptions: appState.recent.redemptions.slice(0, 10),
      ledger: appState.recent.ledger.slice(0, 12)
    }
  };
}

function rebuildWeeklyReview(appState: AppState, previous?: WeeklyReviewView | null): WeeklyReviewView {
  const base = previous ?? defaultWeeklyReview(appState);
  const days =
    base.daily.length > 0
      ? base.daily
      : weekLabels.map((label, index) => ({
          date: addDaysKey(base.weekStart, index),
          label,
          completionCount: 0,
          earnedCoins: 0
        }));
  const dayKeys = new Set(days.map((day) => day.date));
  const completions = appState.recent.completions.filter((item) => dayKeys.has(item.date));
  const ledger = appState.recent.ledger.filter((item) => {
    const date = item.createdAt.slice(0, 10);
    return dayKeys.has(date);
  });
  const redemptions = appState.recent.redemptions.filter((item) =>
    dayKeys.has(item.requestedAt.slice(0, 10))
  );
  const taskMap = new Map<string, { title: string; count: number; points: number }>();

  for (const item of completions) {
    const current = taskMap.get(item.title) ?? {
      title: item.title,
      count: 0,
      points: 0
    };
    current.count += 1;
    current.points += item.pointsAwarded;
    taskMap.set(item.title, current);
  }

  const daily = days.map((day) => ({
    ...day,
    completionCount: completions.filter((item) => item.date === day.date).length,
    earnedCoins: ledger
      .filter((item) => item.amount > 0 && item.createdAt.slice(0, 10) === day.date)
      .reduce((sum, item) => sum + item.amount, 0)
  }));
  const completedDays = daily.filter((day) => day.completionCount > 0).length;
  const taskCompletions = completions.length;
  const coinsEarned = ledger
    .filter((item) => item.amount > 0)
    .reduce((sum, item) => sum + item.amount, 0);
  const coinsSpent = Math.abs(
    ledger.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0)
  );
  const pendingRewards = redemptions.filter((item) => item.status === "requested").length;
  const deliveredRewards = redemptions.filter((item) => item.status === "delivered").length;
  const completionDays = daily.map((day) => day.completionCount > 0);
  let currentStreak = 0;
  let longestStreak = 0;

  for (const hasCompletion of completionDays) {
    currentStreak = hasCompletion ? currentStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  const badges = base.badges.map((badge) => {
    let active = badge.active;
    if (badge.key === "streak") active = longestStreak >= 3;
    if (badge.key === "task-champion") active = taskCompletions >= 5;
    if (badge.key === "coin-saver") active = coinsEarned >= 15;
    if (badge.key === "reward-delivered") active = deliveredRewards > 0;
    if (badge.key === "tidy") active = completions.some((item) => item.title.includes("整理"));
    if (badge.key === "thinking") {
      active = completions.some(
        (item) => item.title.includes("思考") || item.title.includes("难题")
      );
    }
    return { ...badge, active };
  });

  return {
    ...base,
    completedDays,
    taskCompletions,
    coinsEarned,
    coinsSpent,
    pendingRewards,
    deliveredRewards,
    requestedRewards: redemptions.length,
    longestStreak,
    badges,
    daily,
    taskRanking: Array.from(taskMap.values())
      .map((task, index) => ({
        taskId: index + 1,
        ...task
      }))
      .sort((a, b) => b.count - a.count || b.points - a.points)
      .slice(0, 6),
    review: base.review
  };
}

function commitSnapshot(snapshot: StaticPagesSnapshot): StaticPagesSnapshot {
  const appState = normalizeAppState(snapshot.appState);
  const weeklyReview = rebuildWeeklyReview(appState, snapshot.weeklyReview);
  const appWithWeekly = {
    ...appState,
    weeklySummary: summaryFromReview(weeklyReview)
  };
  const adminState = syncAdminFromApp(snapshot.adminState, appWithWeekly);
  const next = {
    ...snapshot,
    appState: appWithWeekly,
    adminState,
    weeklyReview
  };

  if (canUseStorage()) {
    window.__GRIT_PAGES_DATA__ = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function loadStaticSnapshot(): StaticPagesSnapshot | null {
  if (!canUseStorage()) return null;

  const fallback = window.__GRIT_PAGES_DATA__;
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) return fallback ? clone(fallback) : null;

  try {
    return commitSnapshot(JSON.parse(stored) as StaticPagesSnapshot);
  } catch {
    return fallback ? clone(fallback) : null;
  }
}

export function loadStaticAppState() {
  return loadStaticSnapshot()?.appState ?? null;
}

export function loadStaticAdminState() {
  const snapshot = loadStaticSnapshot();
  if (!snapshot) return null;
  return {
    adminState: snapshot.adminState,
    weeklyReview: snapshot.weeklyReview
  };
}

export function completeStaticTask(current: AppState, taskId: number): AppState {
  const snapshot = loadStaticSnapshot();
  const source = snapshot?.appState ?? current;
  const task = source.tasks.find((item) => item.id === taskId);

  if (!task || task.completedToday) return source;

  const createdAt = nowIso();
  const completion: CompletionRecordView = {
    id: nextId(source.recent.completions),
    title: task.title,
    pointsAwarded: task.points,
    date: source.today,
    completedAt: createdAt
  };
  const ledger: LedgerRecordView = {
    id: nextId(source.recent.ledger),
    amount: task.points,
    reason: `完成 ${task.title}`,
    sourceType: "task_completion",
    createdAt
  };
  const appState = normalizeAppState({
    ...source,
    child: {
      ...source.child,
      coinBalance: source.child.coinBalance + task.points
    },
    tasks: source.tasks.map((item) =>
      item.id === taskId ? { ...item, completedToday: true } : item
    ),
    recent: {
      ...source.recent,
      completions: [completion, ...source.recent.completions],
      ledger: [ledger, ...source.recent.ledger]
    }
  });

  if (!snapshot) return appState;

  return commitSnapshot({
    ...snapshot,
    appState
  }).appState;
}

export function cancelStaticTask(current: AppState, taskId: number): AppState {
  const snapshot = loadStaticSnapshot();
  const source = snapshot?.appState ?? current;
  const task = source.tasks.find((item) => item.id === taskId);

  if (!task || !task.completedToday) return source;

  const createdAt = nowIso();
  const ledger: LedgerRecordView = {
    id: nextId(source.recent.ledger),
    amount: -task.points,
    reason: `取消 ${task.title}`,
    sourceType: "task_cancel",
    createdAt
  };
  let removed = false;
  const completions = source.recent.completions.filter((item) => {
    if (!removed && item.title === task.title && item.date === source.today) {
      removed = true;
      return false;
    }
    return true;
  });
  const appState = normalizeAppState({
    ...source,
    child: {
      ...source.child,
      coinBalance: source.child.coinBalance - task.points
    },
    tasks: source.tasks.map((item) =>
      item.id === taskId ? { ...item, completedToday: false } : item
    ),
    recent: {
      ...source.recent,
      completions,
      ledger: [ledger, ...source.recent.ledger]
    }
  });

  if (!snapshot) return appState;

  return commitSnapshot({
    ...snapshot,
    appState
  }).appState;
}

export function redeemStaticReward(current: AppState, rewardId: number): AppState {
  const snapshot = loadStaticSnapshot();
  const source = snapshot?.appState ?? current;
  const reward = source.rewards.find((item) => item.id === rewardId);

  if (!reward || !reward.enabled) throw new Error("奖励不可兑换");
  if (source.child.coinBalance < reward.cost) throw new Error("星币还不够，继续攒一攒");

  const createdAt = nowIso();
  const redemption: RedemptionRecordView = {
    id: nextId(source.recent.redemptions),
    title: reward.title,
    cost: reward.cost,
    status: "requested",
    requestedAt: createdAt,
    deliveredAt: null,
    cancelledAt: null
  };
  const ledger: LedgerRecordView = {
    id: nextId(source.recent.ledger),
    amount: -reward.cost,
    reason: `兑换 ${reward.title}`,
    sourceType: "redemption",
    createdAt
  };
  const appState = normalizeAppState({
    ...source,
    child: {
      ...source.child,
      coinBalance: source.child.coinBalance - reward.cost
    },
    recent: {
      ...source.recent,
      redemptions: [redemption, ...source.recent.redemptions],
      ledger: [ledger, ...source.recent.ledger]
    }
  });

  if (!snapshot) return appState;

  return commitSnapshot({
    ...snapshot,
    appState
  }).appState;
}

export function scheduleFromTemplate(adminState: AdminState): ScheduleBlockView[] {
  const template = adminState.templates[0];
  if (!template) return adminState.schedule;

  return template.blocks
    .filter((block) => block.enabled)
    .map((block) => {
      const task = block.taskId
        ? adminState.tasks.find((item) => item.id === block.taskId) ?? null
        : null;
      return {
        id: `block-${block.id}`,
        sourceId: block.id > 0 ? block.id : null,
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        description: block.description,
        type: block.type,
        sortOrder: block.sortOrder,
        taskId: block.taskId,
        taskTitle: task?.title ?? null,
        points: task?.points ?? null,
        completedToday: block.taskId
          ? adminState.tasks.find((item) => item.id === block.taskId)?.completedToday ?? false
          : false
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.sortOrder - b.sortOrder);
}

export function commitStaticAdminState(
  adminState: AdminState,
  weeklyReview?: WeeklyReviewView | null
): StaticPagesSnapshot {
  const snapshot = loadStaticSnapshot();
  const normalizedAdmin = {
    ...adminState,
    child: {
      ...adminState.child,
      coinBalance: Math.max(0, adminState.child.coinBalance)
    }
  };
  const next: StaticPagesSnapshot = {
    page: snapshot?.page,
    appState: appFromAdmin(normalizedAdmin),
    adminState: normalizedAdmin,
    weeklyReview: weeklyReview ?? snapshot?.weeklyReview ?? defaultWeeklyReview(normalizedAdmin)
  };

  return commitSnapshot(next);
}

export function resetStaticDemoRecords(
  adminState: AdminState,
  weeklyReview?: WeeklyReviewView | null
): StaticPagesSnapshot {
  const appState = normalizeAppState({
    ...appFromAdmin(adminState),
    child: {
      ...adminState.child,
      coinBalance: 0
    },
    tasks: adminState.tasks.map((task) => ({ ...task, completedToday: false })),
    schedule: adminState.schedule.map((block) => ({ ...block, completedToday: false })),
    recent: {
      completions: [],
      redemptions: [],
      ledger: []
    }
  });
  const review = {
    ...(weeklyReview ?? defaultWeeklyReview(appState)),
    completedDays: 0,
    taskCompletions: 0,
    coinsEarned: 0,
    coinsSpent: 0,
    pendingRewards: 0,
    deliveredRewards: 0,
    requestedRewards: 0,
    longestStreak: 0,
    badges: (weeklyReview ?? defaultWeeklyReview(appState)).badges.map((badge) => ({
      ...badge,
      active: false
    })),
    daily: (weeklyReview ?? defaultWeeklyReview(appState)).daily.map((day) => ({
      ...day,
      completionCount: 0,
      earnedCoins: 0
    })),
    taskRanking: [],
    review: {
      observation: "",
      nextFocus: ""
    }
  };

  return commitSnapshot({
    page: loadStaticSnapshot()?.page,
    appState,
    adminState: syncAdminFromApp(adminState, appState),
    weeklyReview: review
  });
}
