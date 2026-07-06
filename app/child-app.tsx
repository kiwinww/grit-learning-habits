"use client";

import { useMemo, useState } from "react";
import { imageAssets } from "@/lib/assets";
import type { AppState, RewardView, ScheduleBlockView } from "@/lib/types";

type Props = {
  initialState: AppState;
};

type Notice = {
  type: "good" | "soft" | "warn";
  text: string;
};

async function postJson(url: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "操作没有成功");
  }

  return data as AppState;
}

function rewardLabel(status: string) {
  if (status === "delivered") return "已兑现";
  if (status === "cancelled") return "已取消";
  return "待家长兑现";
}

function typeLabel(type: string) {
  if (type === "task") return "学习任务";
  if (type === "free") return "自由时间";
  return "日常安排";
}

function scheduleIcon(block: ScheduleBlockView) {
  if (block.type === "free") return imageAssets.icons.free;
  if (block.title.includes("睡") || block.title.includes("整理")) return imageAssets.icons.bedtime;
  if (block.type === "task") return imageAssets.icons.learning;
  return imageAssets.icons.routine;
}

function StickyScheduleCard({
  block,
  busy,
  onToggleTask
}: {
  block: ScheduleBlockView;
  busy: boolean;
  onToggleTask: (taskId: number, title: string, completed: boolean) => void;
}) {
  return (
    <article className={`sticky-note sticky-${block.type}`}>
      <div className="sticky-pin" aria-hidden="true" />
      <img className="sticky-icon" alt="" src={scheduleIcon(block)} />
      <div className="sticky-time">
        <span>{block.startTime}</span>
        <span>{block.endTime}</span>
      </div>
      <span className="sticky-type">{typeLabel(block.type)}</span>
      <h3>{block.title}</h3>
      <p>{block.description}</p>
      {block.taskId ? (
        <button
          className={block.completedToday ? "complete-button done" : "complete-button"}
          disabled={busy}
          onClick={() => onToggleTask(block.taskId as number, block.title, block.completedToday)}
          type="button"
        >
          {block.completedToday ? "取消完成" : `完成得 ${block.points ?? 0} 星币`}
        </button>
      ) : (
        <span className="quiet-pill">{block.type === "free" ? "好好享受" : "照着做就好"}</span>
      )}
      <div className="sticky-status" aria-hidden="true">
        {block.completedToday ? "✓" : block.taskId ? "+" : ""}
      </div>
    </article>
  );
}

function RewardCard({
  reward,
  busy,
  onRedeem
}: {
  reward: RewardView;
  busy: boolean;
  onRedeem: (reward: RewardView) => void;
}) {
  const imageUrl = reward.imageUrl ?? reward.defaultImageUrl;

  return (
    <article className={`reward-card reward-${reward.category}`}>
      <div className="reward-art reward-photo">
        <img alt="" src={imageUrl} />
      </div>
      <div className="reward-copy">
        <div className="reward-meta">
          <span>{reward.tier}</span>
          <strong>{reward.cost} 星币</strong>
        </div>
        <h3>{reward.title}</h3>
        <p>{reward.description}</p>
        <button
          className={reward.canRedeem ? "redeem-button" : "redeem-button locked"}
          disabled={busy || !reward.enabled}
          onClick={() => onRedeem(reward)}
          type="button"
        >
          {reward.canRedeem ? "兑换奖励" : "继续攒星币"}
        </button>
      </div>
    </article>
  );
}

function WeeklyAchievement({
  state
}: {
  state: AppState;
}) {
  const summary = state.weeklySummary;
  const activeBadges = summary.badges.filter((badge) => badge.active);
  const badges = activeBadges.length > 0 ? activeBadges : summary.badges.slice(0, 3);

  return (
    <section className="kid-section weekly-kid-section" id="weekly">
      <div className="weekly-kid-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">本周小成就</p>
            <h2>小树正在长高</h2>
          </div>
          <span className="coin-pill">
            {summary.weekStart} - {summary.weekEnd}
          </span>
        </div>
        <div className="weekly-metrics">
          <span>
            <strong>{summary.completedDays}</strong>
            完成天数
          </span>
          <span>
            <strong>{summary.taskCompletions}</strong>
            完成任务
          </span>
          <span>
            <strong>{summary.coinsEarned}</strong>
            获得星币
          </span>
          <span>
            <strong>{summary.pendingRewards}</strong>
            待兑现
          </span>
        </div>
        <div className="badge-grid">
          {badges.map((badge) => (
            <article className={badge.active ? "badge-card active" : "badge-card"} key={badge.key}>
              <img alt="" src={badge.imageUrl} />
              <div>
                <strong>{badge.title}</strong>
                <span>{badge.description}</span>
              </div>
            </article>
          ))}
        </div>
        {summary.taskCompletions === 0 ? (
          <div className="weekly-empty">
            <img alt="" src={imageAssets.emptyWeekly} />
            <span>完成一个日程任务后，这里会亮起本周徽章。</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ChildApp({ initialState }: Props) {
  const [state, setState] = useState(initialState);
  const [notice, setNotice] = useState<Notice>({
    type: "soft",
    text: "先看今日日程，完成任务得星币，再兑换奖励。"
  });
  const [busy, setBusy] = useState(false);
  const target = state.targetReward;
  const targetProgress = useMemo(() => {
    if (!target) return 0;
    return Math.min(Math.round((state.child.coinBalance / target.cost) * 100), 100);
  }, [state.child.coinBalance, target]);

  async function completeTask(taskId: number, title: string) {
    const nextState = await postJson(`/api/tasks/${taskId}/complete`);
    setState(nextState);
    setNotice({ type: "good", text: `完成「${title}」，星币到账。` });
  }

  async function cancelTask(taskId: number, title: string) {
    const nextState = await postJson(`/api/tasks/${taskId}/cancel`);
    setState(nextState);
    setNotice({ type: "soft", text: `已取消「${title}」，星币已扣回。` });
  }

  async function toggleTask(taskId: number, title: string, completed: boolean) {
    setBusy(true);
    try {
      if (completed) {
        await cancelTask(taskId, title);
      } else {
        await completeTask(taskId, title);
      }
    } catch (error) {
      setNotice({ type: "warn", text: error instanceof Error ? error.message : "任务操作失败" });
    } finally {
      setBusy(false);
    }
  }

  async function redeemReward(reward: RewardView) {
    setBusy(true);
    try {
      const nextState = await postJson(`/api/rewards/${reward.id}/redeem`);
      setState(nextState);
      setNotice({ type: "good", text: `兑换成功：${reward.title}，等家长兑现。` });
    } catch (error) {
      setNotice({ type: "warn", text: error instanceof Error ? error.message : "兑换没有成功" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="kid-page">
      <header className="kid-topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>森林星币站</span>
        </a>
        <nav>
          <a href="#schedule">
            <img alt="" src={imageAssets.icons.schedule} />
            今日日程
          </a>
          <a href="#weekly">
            <img alt="" src={imageAssets.icons.weekly} />
            本周成就
          </a>
          <a href="#rewards">
            <img alt="" src={imageAssets.icons.reward} />
            兑换奖励
          </a>
          <a href="/admin">
            <img alt="" src={imageAssets.icons.parent} />
            家长后台
          </a>
        </nav>
      </header>

      <section className="kid-hero">
        <div className="hero-text">
          <p className="eyebrow">今天是 {state.today}</p>
          <h1>{state.child.name}，沿着小路开始今天的学习探险</h1>
          <p>完成日程里的学习任务，星币会马上到账。点错了也可以取消完成，规则清楚才更安心。</p>
          <div className={`notice notice-${notice.type}`} role="status">
            {notice.text}
          </div>
        </div>
        <aside className="coin-panel">
          <span className="panel-label">我的星币</span>
          <strong>{state.child.coinBalance}</strong>
          <span className="panel-label">当前目标</span>
          <h2>{target?.title ?? "先设置一个奖励"}</h2>
          <div className="progress-track">
            <span style={{ width: `${targetProgress}%` }} />
          </div>
          <small>
            {target
              ? state.child.coinBalance >= target.cost
                ? "已经可以兑换啦"
                : `还差 ${target.cost - state.child.coinBalance} 枚星币`
              : "家长可以在后台添加奖励"}
          </small>
        </aside>
      </section>

      <section className="kid-section" id="schedule">
        <div className="section-heading centered">
          <p className="eyebrow">今日日程</p>
          <h2>便利贴看板</h2>
        </div>
        <div className="schedule-board">
          {state.schedule.map((block) => (
            <StickyScheduleCard
              block={block}
              busy={busy}
              key={block.id}
              onToggleTask={toggleTask}
            />
          ))}
        </div>
      </section>

      <WeeklyAchievement state={state} />

      <section className="kid-section reward-section" id="rewards">
        <div className="section-heading">
          <div>
            <p className="eyebrow">兑换奖励</p>
            <h2>星币商店</h2>
          </div>
          <span className="coin-pill">{state.child.coinBalance} 枚星币</span>
        </div>
        <div className="reward-grid">
          {state.rewards
            .filter((reward) => reward.enabled)
            .map((reward) => (
              <RewardCard
                busy={busy}
                key={reward.id}
                onRedeem={redeemReward}
                reward={reward}
              />
            ))}
        </div>
      </section>

      <section className="kid-section record-strip">
        <div>
          <p className="eyebrow">最近记录</p>
          <h2>今天的小脚印</h2>
        </div>
        <div className="record-list">
          {state.recent.completions.slice(0, 3).map((item) => (
            <span key={item.id}>
              完成 {item.title}，+{item.pointsAwarded} 星币
            </span>
          ))}
          {state.recent.redemptions.slice(0, 3).map((item) => (
            <span key={`r-${item.id}`}>
              {item.title}：{rewardLabel(item.status)}
            </span>
          ))}
          {state.recent.completions.length === 0 && state.recent.redemptions.length === 0 ? (
            <span>完成第一个任务后，这里会出现记录。</span>
          ) : null}
        </div>
      </section>
    </main>
  );
}
