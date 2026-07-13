"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Loading, Modal, Progress, Tag, Title, Wallet } from "animal-island-ui";
import { SiteFooter } from "@/app/site-footer";
import { MotionPreference } from "@/app/interaction-shell";
import { shouldReduceMotion, TransitionLink } from "@/app/route-transition";
import type { ChildState } from "@/lib/contracts";
import { Notification } from "@/lib/animal-notification";

type ViewKey = "today" | "rewards" | "growth" | "records";
type Reward = ChildState["rewards"][number];

const nav: Array<{ key: ViewKey; icon: string; label: string }> = [
  { key: "today", icon: "☀", label: "今天" },
  { key: "rewards", icon: "★", label: "奖励" },
  { key: "growth", icon: "♣", label: "成长" },
  { key: "records", icon: "≡", label: "记录" }
];

export function ChildDashboard({ initialState }: { initialState: ChildState }) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<ViewKey>("today");
  const [busy, setBusy] = useState(false);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const target = state.rewards.find((reward) => reward.id === state.targetRewardId) ?? null;
  const completed = state.schedule.filter((item) => item.status === "approved").length;
  const taskCount = state.schedule.filter((item) => item.taskId).length;
  const progress = taskCount ? Math.round((completed / taskCount) * 100) : 0;

  useEffect(() => {
    const check = () => {
      const now = new Intl.DateTimeFormat("en-GB", { timeZone: state.family.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      for (const item of state.schedule) {
        const key = `reminded:${state.today}:${item.id}`;
        if (item.reminder && !item.status && now >= item.startTime && now <= item.endTime && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          Notification.info({ message: `现在可以开始：${item.title}`, description: item.description, duration: 6 });
          break;
        }
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [state.family.timezone, state.schedule, state.today]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/child/state", { cache: "no-store" });
      if (response.ok) {
        const next = (await response.json()) as ChildState;
        if (next.today !== state.today) setState(next);
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [state.today]);

  async function action(payload: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/child/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "操作没有完成");
      setState(result as ChildState);
      Notification.success(success);
    } catch (error) {
      Notification.error({ message: "还差一点点", description: error instanceof Error ? error.message : "请稍后再试。" });
    } finally {
      setBusy(false);
    }
  }

  const currentContent = useMemo(() => {
    if (view === "today") {
      return (
        <>
          <section className="kid-hero" aria-labelledby="today-title">
            <div>
              <p className="eyebrow">{state.todayLabel}</p>
              <h1 id="today-title">{state.child.nickname}，今天先做这一小步</h1>
              <p className="lead">按时间看看现在要做什么。完成一项，就让小树长高一点。</p>
              <div className="hero-progress">
                <span>今日进度 {completed}/{taskCount}</span>
                <Progress percent={progress} infoFormat={() => `${progress}%`} />
              </div>
            </div>
            <Card className="wallet-card" color="app-teal" pattern="app-green">
              <span>我的星币</span>
              <Wallet size="large" value={state.balance} />
              <strong>{target?.title ?? "还没有目标奖励"}</strong>
              <small>{target ? (state.balance >= target.cost ? "已经可以兑换啦！" : `还差 ${target.cost - state.balance} 枚星币`) : "去奖励页选一个小目标"}</small>
            </Card>
          </section>
          <section className="page-section" aria-labelledby="schedule-title">
            <div className="section-heading">
              <div><p className="eyebrow">现在需要做什么</p><Title color="app-yellow" size="large">今日日程</Title></div>
              <Tag color="app-teal" variant="outlined">{taskCount ? `${completed}/${taskCount} 已完成` : "轻松的一天"}</Tag>
            </div>
            <div className="schedule-list">
              {state.schedule.length ? state.schedule.map((item) => (
                <Card className={`schedule-card ${item.status ? `is-${item.status}` : ""}`} key={item.id}>
                  <div className="time-badge"><strong>{item.startTime}</strong><span>{item.endTime}</span></div>
                  <div className="schedule-copy"><h2>{item.title}</h2><p>{item.description}</p>{item.taskId ? <Tag color="app-yellow" variant="outlined">+{item.points} 星币</Tag> : <Tag color="app-green">温柔提醒</Tag>}</div>
                  {item.taskId ? (
                    <Button disabled={busy || Boolean(item.status)} htmlType="button" loading={busy} onClick={() => action({ action: "completeTask", taskId: item.taskId, idempotencyKey: crypto.randomUUID() }, item.status === "pending" ? "已交给家长确认" : "完成啦，星币已到账！")} size="large" type={item.status ? "default" : "primary"}>
                      {item.status === "approved" ? "已完成 ✓" : item.status === "pending" ? "等待家长确认" : "我完成了"}
                    </Button>
                  ) : <span className="reminder-mark">照着做就好</span>}
                </Card>
              )) : <Card type="dashed"><p className="empty-copy">今天还没有安排任务，去享受一段自由时间吧。</p></Card>}
            </div>
          </section>
        </>
      );
    }
    if (view === "rewards") {
      return (
        <section className="page-section standalone" aria-labelledby="rewards-title">
          <div className="section-heading"><div><p className="eyebrow">把努力变成家庭约定</p><Title color="app-orange" size="large">星币奖励</Title></div><Wallet value={state.balance} /></div>
          <div className="reward-grid">
            {state.rewards.filter((reward) => reward.enabled).map((reward) => (
              <Card className={`reward-card ${reward.id === state.targetRewardId ? "is-target" : ""}`} key={reward.id}>
                <div className="reward-art">{reward.hasImage ? <img alt={`${reward.title}奖励图片`} src={`/api/rewards/${reward.id}/image`} /> : <span aria-hidden="true">🎁</span>}</div>
                <Tag color="app-orange" variant="outlined">{reward.category}</Tag>
                <h2>{reward.title}</h2><p>{reward.description}</p><strong className="reward-cost">★ {reward.cost}</strong>
                <div className="card-actions">
                  <Button htmlType="button" onClick={() => action({ action: "setTargetReward", rewardId: reward.id }, "目标奖励已经更新")} type={reward.id === state.targetRewardId ? "default" : "text"}>{reward.id === state.targetRewardId ? "当前目标" : "设为目标"}</Button>
                  <Button disabled={busy || !reward.canRedeem} htmlType="button" onClick={() => setRedeeming(reward)} type="primary">{reward.canRedeem ? "兑换" : "继续攒币"}</Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      );
    }
    if (view === "growth") {
      return (
        <section className="page-section standalone" aria-labelledby="growth-title">
          <div className="section-heading"><div><p className="eyebrow">看见每一个小进步</p><Title color="app-green" size="large">本周成长</Title></div></div>
          <div className="metric-grid">
            <Card color="app-teal"><strong>{state.weekly.completedDays}</strong><span>完成天数</span></Card>
            <Card color="app-yellow"><strong>{state.weekly.completedTasks}</strong><span>完成任务</span></Card>
            <Card color="app-orange"><strong>{state.weekly.coinsEarned}</strong><span>获得星币</span></Card>
            <Card color="app-green"><strong>{state.weekly.streak}</strong><span>连续天数</span></Card>
          </div>
          <h2 className="subheading">我的徽章</h2>
          <div className="badge-grid">{state.weekly.badges.map((badge) => <Card className={badge.earned ? "badge-card earned" : "badge-card"} key={badge.key}><span aria-hidden="true">{badge.earned ? "🌟" : "○"}</span><div><strong>{badge.title}</strong><p>{badge.description}</p></div></Card>)}</div>
        </section>
      );
    }
    return (
      <section className="page-section standalone" aria-labelledby="records-title">
        <div className="section-heading"><div><p className="eyebrow">所有变化都有来处</p><Title color="app-teal" size="large">最近记录</Title></div></div>
        <div className="record-columns">
          <Card><h2>任务完成</h2><ul className="record-list">{state.recent.completions.map((item) => <li key={item.id}><span><strong>{item.title}</strong><small>{item.date} · {item.status === "approved" ? "已确认" : item.status === "pending" ? "待确认" : "已撤销"}</small></span><b>+{item.points}</b></li>)}</ul></Card>
          <Card><h2>星币流水</h2><ul className="record-list">{state.recent.transactions.map((item) => <li key={item.id}><span><strong>{item.reason}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></span><b className={item.amount < 0 ? "negative" : ""}>{item.amount > 0 ? "+" : ""}{item.amount}</b></li>)}</ul></Card>
          <Card><h2>奖励兑换</h2><ul className="record-list">{state.recent.redemptions.map((item) => <li key={item.id}><span><strong>{item.title}</strong><small>{item.status === "pending" ? "等待家长兑现" : item.status === "fulfilled" ? "已兑现" : "已取消"}</small></span><b>-{item.cost}</b></li>)}</ul></Card>
        </div>
      </section>
    );
  }, [busy, completed, progress, state, target, taskCount, view]);

  return (
    <div className={state.family.animationsEnabled ? "app-shell" : "app-shell reduce-motion"}>
      <MotionPreference enabled={state.family.animationsEnabled} />
      <header className="kid-header"><TransitionLink className="brand" href="/" motionEnabled={state.family.animationsEnabled}><span aria-hidden="true">★</span><strong>{state.family.name}</strong></TransitionLink><TransitionLink className="parent-link" href="/admin" motionEnabled={state.family.animationsEnabled}>家长入口</TransitionLink></header>
      <main id="main-content"><div className="child-view-transition" key={view}>{currentContent}</div></main>
      <nav aria-label="孩子端主导航" className="bottom-nav">{nav.map((item) => <button aria-current={view === item.key ? "page" : undefined} key={item.key} onClick={() => { if (view === item.key) return; setView(item.key); window.scrollTo({ top: 0, behavior: shouldReduceMotion(state.family.animationsEnabled) ? "auto" : "smooth" }); }} type="button"><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
      <SiteFooter />
      <Loading active={busy} />
      <Modal footer={<><Button htmlType="button" onClick={() => setRedeeming(null)}>再想想</Button><Button htmlType="button" onClick={() => { if (redeeming) action({ action: "redeemReward", rewardId: redeeming.id, idempotencyKey: crypto.randomUUID() }, "兑换成功，等家长兑现吧！"); setRedeeming(null); }} type="primary">确认兑换</Button></>} onClose={() => setRedeeming(null)} open={Boolean(redeeming)} title="确认兑换" typewriter={false}>
        {redeeming ? <p>用 {redeeming.cost} 枚星币兑换“{redeeming.title}”吗？兑换后会生成待家长兑现记录。</p> : null}
      </Modal>
    </div>
  );
}
