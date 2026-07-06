export const imageAssets = {
  brand: "/assets/gpt-image/icons/icon-brand-leaf-coin.png",
  coin: "/assets/gpt-image/icons/icon-star-coin.png",
  heroDesktop: "/assets/gpt-image/backgrounds/hero-forest-desktop.png",
  heroMobile: "/assets/gpt-image/backgrounds/hero-forest-mobile.png",
  adminBackground: "/assets/gpt-image/backgrounds/admin-forest-dashboard.png",
  weeklyBackground: "/assets/gpt-image/backgrounds/background-weekly-cell.png",
  rewardShopBackground: "/assets/gpt-image/backgrounds/background-reward-shop-cell.png",
  emptyWeekly: "/assets/gpt-image/empty-states/empty-weekly.png",
  emptyRecords: "/assets/gpt-image/empty-states/empty-records.png",
  emptyRedemptions: "/assets/gpt-image/empty-states/empty-redemptions.png",
  icons: {
    schedule: "/assets/gpt-image/icons/icon-nav-schedule.png",
    reward: "/assets/gpt-image/icons/icon-nav-reward.png",
    records: "/assets/gpt-image/icons/icon-nav-records.png",
    weekly: "/assets/gpt-image/icons/icon-nav-weekly.png",
    parent: "/assets/gpt-image/icons/icon-nav-parent.png",
    learning: "/assets/gpt-image/icons/icon-task-learning.png",
    routine: "/assets/gpt-image/icons/icon-type-routine.png",
    free: "/assets/gpt-image/icons/icon-type-free.png",
    bedtime: "/assets/gpt-image/icons/icon-type-bedtime.png",
    review: "/assets/gpt-image/icons/icon-review-observation.png",
    calendar: "/assets/gpt-image/icons/icon-calendar.png",
    redemption: "/assets/gpt-image/icons/icon-redemption-gift.png",
    ledger: "/assets/gpt-image/icons/icon-coin-ledger.png",
    settings: "/assets/gpt-image/icons/icon-settings.png"
  },
  badges: {
    streak: "/assets/gpt-image/badges/badge-streak.png",
    taskChampion: "/assets/gpt-image/badges/badge-task-champion.png",
    coinSaver: "/assets/gpt-image/badges/badge-coin-saver.png",
    rewardDelivered: "/assets/gpt-image/badges/badge-reward-delivered.png",
    tidy: "/assets/gpt-image/badges/badge-tidy.png",
    thinking: "/assets/gpt-image/badges/badge-thinking.png",
    focus: "/assets/gpt-image/badges/badge-focus.png",
    correction: "/assets/gpt-image/badges/badge-correction.png",
    praise: "/assets/gpt-image/badges/badge-praise.png",
    weeklyReview: "/assets/gpt-image/badges/badge-weekly-review.png",
    earlyStarter: "/assets/gpt-image/badges/badge-early-starter.png",
    balancedRest: "/assets/gpt-image/badges/badge-balanced-rest.png"
  },
  rewards: {
    screen: "/assets/gpt-image/rewards/reward-screen.png",
    food: "/assets/gpt-image/rewards/reward-food.png",
    book: "/assets/gpt-image/rewards/reward-book.png",
    outing: "/assets/gpt-image/rewards/reward-outing.png",
    choice: "/assets/gpt-image/rewards/reward-choice.png",
    delayed: "/assets/gpt-image/rewards/reward-delayed.png",
    game: "/assets/gpt-image/rewards/reward-game.png",
    craft: "/assets/gpt-image/rewards/reward-craft.png"
  }
};

export function rewardDefaultImage(category: string, sortOrder: number) {
  if (category === "screen") return imageAssets.rewards.screen;
  if (category === "food") return imageAssets.rewards.food;
  if (category === "book") return imageAssets.rewards.book;
  if (category === "outing") return imageAssets.rewards.outing;

  const fallback = [
    imageAssets.rewards.choice,
    imageAssets.rewards.delayed,
    imageAssets.rewards.game,
    imageAssets.rewards.craft
  ];

  return fallback[Math.max(0, sortOrder - 1) % fallback.length];
}
