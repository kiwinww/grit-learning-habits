"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Progress, Tag, Title, Wallet } from "@/lib/animal-ui";
import { imageAssets } from "@/lib/assets";
import { SiteAttribution } from "@/app/site-attribution";
import {
  cancelStaticTask,
  completeStaticTask,
  loadStaticAppState,
  redeemStaticReward
} from "@/lib/static-pages-state";
import type { AppState, RewardView, ScheduleBlockView } from "@/lib/types";

type Props = {
  initialState: AppState;
  staticMode?: boolean;
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
      <Tag
        className="sticky-type"
        color={block.type === "task" ? "app-yellow" : block.type === "free" ? "app-teal" : "app-green"}
        size="small"
        variant="outlined"
      >
        {typeLabel(block.type)}
      </Tag>
      <h3>{block.title}</h3>
      <p>{block.description}</p>
      {block.taskId ? (
        <Button
          className={block.completedToday ? "complete-button done" : "complete-button"}
          disabled={busy}
          htmlType="button"
          loading={busy}
          onClick={() => onToggleTask(block.taskId as number, block.title, block.completedToday)}
          size="middle"
          type={block.completedToday ? "default" : "primary"}
        >
          {block.completedToday ? "取消完成" : `完成得 ${block.points ?? 0} 星币`}
        </Button>
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
          <Tag color="app-orange" size="small" variant="outlined">
            {reward.tier}
          </Tag>
          <strong>{reward.cost} 星币</strong>
        </div>
        <h3>{reward.title}</h3>
        <p>{reward.description}</p>
        <Button
          className={reward.canRedeem ? "redeem-button" : "redeem-button locked"}
          disabled={busy || !reward.enabled}
          htmlType="button"
          loading={busy}
          onClick={() => onRedeem(reward)}
          size="large"
          type={reward.canRedeem ? "primary" : "default"}
        >
          {reward.canRedeem ? "兑换奖励" : "继续攒星币"}
        </Button>
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
            <Title className="section-title" color="app-teal" size="large">
              小树正在长高
            </Title>
          </div>
          <Tag className="coin-pill" color="app-yellow" size="medium" variant="outlined">
            {summary.weekStart} - {summary.weekEnd}
          </Tag>
        </div>
        <div className="weekly-metrics">
          <Card className="weekly-metric-card" pattern="app-teal">
            <strong>{summary.completedDays}</strong>
            完成天数
          </Card>
          <Card className="weekly-metric-card" pattern="app-yellow">
            <strong>{summary.taskCompletions}</strong>
            完成任务
          </Card>
          <Card className="weekly-metric-card" pattern="app-orange">
            <strong>{summary.coinsEarned}</strong>
            获得星币
          </Card>
          <Card className="weekly-metric-card" pattern="app-green">
            <strong>{summary.pendingRewards}</strong>
            待兑现
          </Card>
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

export function ChildApp({ initialState, staticMode = false }: Props) {
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

  useEffect(() => {
    if (!staticMode) return;

    const storedState = loadStaticAppState();
    if (storedState) {
      setState(storedState);
    }
  }, [staticMode]);

  async function completeTask(taskId: number, title: string) {
    if (staticMode) {
      const nextState = completeStaticTask(state, taskId);
      setState(nextState);
      setNotice({ type: "good", text: `完成「${title}」，星币已保存在这个浏览器里。` });
      return;
    }

    const nextState = await postJson(`/api/tasks/${taskId}/complete`);
    setState(nextState);
    setNotice({ type: "good", text: `完成「${title}」，星币到账。` });
  }

  async function cancelTask(taskId: number, title: string) {
    if (staticMode) {
      const nextState = cancelStaticTask(state, taskId);
      setState(nextState);
      setNotice({ type: "soft", text: `已取消「${title}」，本地星币记录已更新。` });
      return;
    }

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
      if (staticMode) {
        const nextState = redeemStaticReward(state, reward.id);
        setState(nextState);
        setNotice({ type: "good", text: `兑换成功：${reward.title}，家长后台会看到待兑现记录。` });
        return;
      }

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
        <nav aria-label="孩子端主导航">
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
        <aside className="coin-panel-shell">
          <Card className="coin-panel" pattern="app-teal">
            <span className="panel-label">我的星币</span>
            <Wallet className="coin-wallet" size="large" value={state.child.coinBalance} />
            <span className="panel-label">当前目标</span>
            <h2>{target?.title ?? "先设置一个奖励"}</h2>
            <Progress
              className="target-progress"
              percent={targetProgress}
              showInfo={false}
              size="small"
            />
            <small>
              {target
                ? state.child.coinBalance >= target.cost
                  ? "已经可以兑换啦"
                  : `还差 ${target.cost - state.child.coinBalance} 枚星币`
                : "家长可以在后台添加奖励"}
            </small>
          </Card>
        </aside>
      </section>

      <section className="kid-section" id="schedule">
        <div className="section-heading centered">
          <p className="eyebrow">今日日程</p>
          <Title className="section-title" color="app-teal" size="large">
            便利贴看板
          </Title>
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
            <Title className="section-title" color="app-yellow" size="large">
              星币商店
            </Title>
          </div>
          <Tag className="coin-pill" color="app-yellow" size="medium" variant="outlined">
            {state.child.coinBalance} 枚星币
          </Tag>
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
      <SiteAttribution />
    </main>
  );
}
