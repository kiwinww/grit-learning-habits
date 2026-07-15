export type HeroMessage = { title: string; subtitle: string };

export type RedemptionRecord = { id: number; title: string; cost: number; status: string; requestedAt: string };

export type ChildState = {
  today: string;
  todayLabel: string;
  family: { name: string; timezone: string; animationsEnabled: boolean; allowBackfill: boolean; heroMessages: HeroMessage[] };
  child: { id: number; nickname: string; avatar: string };
  balance: number;
  targetRewardId: number | null;
  schedule: Array<{
    id: number;
    taskId: number | null;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    reminder: boolean;
    points: number;
    status: string | null;
    completionId: number | null;
    canCancel: boolean;
  }>;
  rewards: Array<{
    id: number;
    title: string;
    description: string;
    cost: number;
    category: string;
    enabled: boolean;
    hasImage: boolean;
    canRedeem: boolean;
    dailyLimit: number | null;
    weeklyLimit: number | null;
  }>;
  weekly: {
    start: string;
    end: string;
    completedDays: number;
    completedTasks: number;
    coinsEarned: number;
    streak: number;
    badges: Array<{ key: string; title: string; description: string; earned: boolean }>;
  };
  recent: {
    completions: Array<{ id: number; title: string; points: number; date: string; status: string }>;
    transactions: Array<{ id: number; amount: number; reason: string; createdAt: string }>;
    redemptions: RedemptionRecord[];
  };
};

export type AdminAlertState =
  | { authenticated: false }
  | { authenticated: true; balance: number; pendingCount: number; redemptions: RedemptionRecord[] };

export type AdminState = ChildState & {
  tasks: Array<{
    id: number;
    title: string;
    childDescription: string;
    category: string;
    points: number;
    requiresApproval: boolean;
    isCore: boolean;
    enabled: boolean;
    sortOrder: number;
  }>;
  schedules: Array<{
    id: number;
    taskId: number | null;
    title: string;
    description: string;
    scheduleType: string;
    weekday: number | null;
    specificDate: string | null;
    startTime: string;
    endTime: string;
    reminder: boolean;
    enabled: boolean;
    sortOrder: number;
  }>;
  pendingCompletions: Array<{ id: number; title: string; date: string; points: number }>;
  reviews: Array<{ weekStart: string; weekEnd: string; wins: string; difficulties: string; nextFocus: string }>;
  stabilityHints: Array<{ taskId: number; title: string; message: string }>;
  resetOptions: {
    tasks: Array<{ id: number; title: string; completionCount: number; ledgerAmount: number }>;
    rewards: Array<{ id: number; title: string; redemptionCount: number; ledgerAmount: number }>;
    total: { completionCount: number; redemptionCount: number; reviewCount: number };
  };
};
