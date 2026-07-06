export type ChildView = {
  id: number;
  name: string;
  avatar: string;
  coinBalance: number;
};

export type TaskView = {
  id: number;
  title: string;
  description: string;
  points: number;
  enabled: boolean;
  sortOrder: number;
  completedToday: boolean;
};

export type RewardView = {
  id: number;
  title: string;
  description: string;
  cost: number;
  tier: string;
  category: string;
  imageUrl: string | null;
  defaultImageUrl: string;
  enabled: boolean;
  sortOrder: number;
  canRedeem: boolean;
};

export type WeeklyBadgeView = {
  key: string;
  title: string;
  description: string;
  imageUrl: string;
  active: boolean;
};

export type WeeklyDailyView = {
  date: string;
  label: string;
  completionCount: number;
  earnedCoins: number;
};

export type WeeklyTaskRankView = {
  taskId: number;
  title: string;
  count: number;
  points: number;
};

export type WeeklySummaryView = {
  weekStart: string;
  weekEnd: string;
  completedDays: number;
  taskCompletions: number;
  coinsEarned: number;
  coinsSpent: number;
  pendingRewards: number;
  deliveredRewards: number;
  requestedRewards: number;
  longestStreak: number;
  badges: WeeklyBadgeView[];
  daily: WeeklyDailyView[];
};

export type WeeklyReviewView = WeeklySummaryView & {
  taskRanking: WeeklyTaskRankView[];
  review: {
    observation: string;
    nextFocus: string;
  };
};

export type ScheduleBlockView = {
  id: string;
  sourceId: number | null;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  type: string;
  sortOrder: number;
  taskId: number | null;
  taskTitle: string | null;
  points: number | null;
  completedToday: boolean;
};

export type CompletionRecordView = {
  id: number;
  title: string;
  pointsAwarded: number;
  date: string;
  completedAt: string;
};

export type RedemptionRecordView = {
  id: number;
  title: string;
  cost: number;
  status: string;
  requestedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
};

export type LedgerRecordView = {
  id: number;
  amount: number;
  reason: string;
  sourceType: string;
  createdAt: string;
};

export type AppState = {
  today: string;
  child: ChildView;
  targetReward: RewardView | null;
  schedule: ScheduleBlockView[];
  tasks: TaskView[];
  rewards: RewardView[];
  weeklySummary: WeeklySummaryView;
  recent: {
    completions: CompletionRecordView[];
    redemptions: RedemptionRecordView[];
    ledger: LedgerRecordView[];
  };
};

export type AdminState = AppState & {
  templates: Array<{
    id: number;
    name: string;
    weekdays: string;
    enabled: boolean;
    blocks: Array<{
      id: number;
      startTime: string;
      endTime: string;
      title: string;
      description: string;
      type: string;
      taskId: number | null;
      enabled: boolean;
      sortOrder: number;
    }>;
  }>;
  overrides: Array<{
    id: number;
    date: string;
    action: string;
    title: string | null;
    startTime: string | null;
    endTime: string | null;
  }>;
};
