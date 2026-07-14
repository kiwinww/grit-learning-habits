"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Card, Icon, Modal, Progress, Tag, Title, Typewriter, type IconName } from "animal-island-ui";
import { SiteFooter } from "@/app/site-footer";
import { StarWallet } from "@/app/star-wallet";
import { MotionPreference } from "@/app/interaction-shell";
import { shouldReduceMotion, TransitionLink } from "@/app/route-transition";
import type { ChildState } from "@/lib/contracts";
import { createIdempotencyKey } from "@/lib/client-id";
import { personalizeHeroMessage } from "@/lib/hero-messages";
import { Notification } from "@/lib/animal-notification";

type ViewKey = "today" | "rewards" | "growth" | "records";
type Reward = ChildState["rewards"][number];
type ScheduleItem = ChildState["schedule"][number];

const nav: Array<{ key: ViewKey; icon: IconName; label: string }> = [
  { key: "today", icon: "icon-diy", label: "今天" },
  { key: "rewards", icon: "icon-shopping", label: "奖励" },
  { key: "growth", icon: "icon-miles", label: "成长" },
  { key: "records", icon: "icon-critterpedia", label: "记录" }
];

export function ChildDashboard({ initialState, heroMessageIndex }: { initialState: ChildState; heroMessageIndex: number }) {
  const [state, setState] = useState(initialState);
  const [view, setView] = useState<ViewKey>("today");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const pendingActionRef = useRef<string | null>(null);
  const [redeeming, setRedeeming] = useState<Reward | null>(null);
  const [cancelling, setCancelling] = useState<ScheduleItem | null>(null);
  const [motionReduced, setMotionReduced] = useState(!initialState.family.animationsEnabled);
  const stateRequestRef = useRef(0);
  const busy = pendingAction !== null;
  const target = state.rewards.find((reward) => reward.id === state.targetRewardId) ?? null;
  const completed = state.schedule.filter((item) => item.status === "approved").length;
  const taskCount = state.schedule.filter((item) => item.taskId).length;
  const progress = taskCount ? Math.round((completed / taskCount) * 100) : 0;
  const heroMessage = personalizeHeroMessage(state.family.heroMessages[heroMessageIndex % state.family.heroMessages.length], state.child.nickname);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionReduced(shouldReduceMotion(state.family.animationsEnabled));
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [state.family.animationsEnabled]);

  useEffect(() => {
    document.cookie = "family_child_background=; Path=/; Max-Age=0; SameSite=Lax";
    document.cookie = `family_hero_message=${heroMessageIndex}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [heroMessageIndex]);

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
    let active = true;
    let controller: AbortController | null = null;

    async function refreshState() {
      if (document.visibilityState !== "visible") return;
      const requestId = ++stateRequestRef.current;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/child/state", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const next = (await response.json()) as ChildState;
        if (active && requestId === stateRequestRef.current) setState(next);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Keep the current state and retry quietly on the next interval.
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refreshState();
    }

    const timer = window.setInterval(refreshState, 10_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function action(payload: Record<string, unknown>, success: string, actionKey: string) {
    if (pendingActionRef.current) return false;
    pendingActionRef.current = actionKey;
    stateRequestRef.current += 1;
    setPendingAction(actionKey);
    try {
      const response = await fetch("/api/child/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "操作没有完成");
      setState(result as ChildState);
      Notification.success(success);
      return true;
    } catch (error) {
      Notification.error({ message: "还差一点点", description: error instanceof Error ? error.message : "请稍后再试。" });
      return false;
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  function selectView(nextView: ViewKey) {
    if (view === nextView) return;
    setView(nextView);
    window.scrollTo({ top: 0, behavior: motionReduced ? "auto" : "smooth" });
  }

  function handleNavKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + nav.length) % nav.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % nav.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = nav.length - 1;

    selectView(nav[nextIndex].key);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus();
  }

  const currentContent = useMemo(() => {
    if (view === "today") {
      return <>
        <section className="kid-hero" aria-labelledby="today-title">
          <Card className="hero-copy" color="app-green" pattern="app-green">
            <p className="eyebrow">{state.todayLabel}</p>
            <h1 className="hero-title" id="today-title"><Typewriter autoPlay={!motionReduced} speed={90} trigger={heroMessageIndex}>{heroMessage.title}</Typewriter></h1>
            <p className="lead">{heroMessage.subtitle}</p>
            <div className="hero-progress"><span>今天 {completed}/{taskCount}</span><Progress percent={progress} infoFormat={() => `${progress}%`} size="large" /></div>
          </Card>
          <Card className="wallet-panel" color="app-yellow" pattern="app-yellow">
            <span className="wallet-label">我的星币</span>
            <StarWallet size="large" value={state.balance} />
            <span className="goal-label">当前目标</span>
            {target ? <>
              <strong className="goal-title">{target.title}</strong>
              <strong className={`goal-status${state.balance >= target.cost ? " is-ready" : ""}`}>{state.balance >= target.cost ? "可以兑换了" : `还差 ${target.cost - state.balance} 枚`}</strong>
            </> : <><strong>还没有目标</strong><Button htmlType="button" onClick={() => selectView("rewards")} size="large" type="primary">去选目标</Button></>}
          </Card>
        </section>
        <section className="page-section" aria-labelledby="schedule-title">
          <div className="section-heading"><div><p className="eyebrow">现在做什么</p><Title color="app-yellow" size="large">今日任务</Title></div><Tag color="app-teal" variant="outlined">{taskCount ? `${completed}/${taskCount}` : "轻松一天"}</Tag></div>
          <div className="schedule-list">
            {state.schedule.length ? state.schedule.map((item) => <Card className={`schedule-card ${item.status ? `is-${item.status}` : ""}`} key={item.id}>
              <div className="time-badge"><strong>{item.startTime}</strong><span>{item.endTime}</span></div>
              <div className="schedule-copy"><h2>{item.title}</h2><p>{item.description}</p>{item.taskId ? <StarWallet size="small" value={item.points} /> : <Tag color="app-green">提醒</Tag>}</div>
              {item.taskId ? item.canCancel ? <Button danger disabled={busy} htmlType="button" onClick={() => setCancelling(item)} size="large" type="default">取消完成</Button> : item.status === "approved" ? <Button disabled htmlType="button" size="large" type="default">已完成</Button> : <Button disabled={busy} htmlType="button" onClick={() => action({ action: "completeTask", taskId: item.taskId, idempotencyKey: createIdempotencyKey() }, "完成已记录", `complete:${item.taskId}`)} size="large" type="primary">{pendingAction === `complete:${item.taskId}` ? "记录中…" : item.status === "pending" ? "等待家长确认" : "我完成了"}</Button> : <span className="reminder-mark">照着做就好</span>}
            </Card>) : <Card type="dashed"><p className="empty-copy">今天没有任务。</p></Card>}
          </div>
        </section>
      </>;
    }
    if (view === "rewards") return <section className="page-section standalone" aria-labelledby="rewards-title"><div className="section-heading"><div><p className="eyebrow">选择一个目标</p><Title color="app-orange" size="large">奖励</Title></div><StarWallet size="large" value={state.balance} /></div><div className="reward-grid">{state.rewards.filter((reward) => reward.enabled).map((reward) => <Card className={`reward-card ${reward.id === state.targetRewardId ? "is-target" : ""}`} key={reward.id} pattern="default"><Tag color="app-orange" variant="outlined">{reward.category}</Tag><h2>{reward.title}</h2><p>{reward.description}</p><StarWallet size="medium" value={reward.cost} /><div className="card-actions"><Button disabled={busy} htmlType="button" onClick={() => action({ action: "setTargetReward", rewardId: reward.id }, "目标已更新", `target:${reward.id}`)} type={reward.id === state.targetRewardId ? "default" : "text"}>{pendingAction === `target:${reward.id}` ? "更新中…" : reward.id === state.targetRewardId ? "当前目标" : "设为目标"}</Button><Button disabled={busy || !reward.canRedeem} htmlType="button" onClick={() => setRedeeming(reward)} type="primary">{reward.canRedeem ? "兑换" : "继续攒"}</Button></div></Card>)}</div></section>;
    if (view === "growth") return <section className="page-section standalone" aria-labelledby="growth-title"><div className="section-heading"><div><p className="eyebrow">本周表现</p><Title color="app-green" size="large">成长</Title></div></div><div className="metric-grid"><Card color="app-teal"><strong>{state.weekly.completedDays}</strong><span>完成天数</span></Card><Card color="app-yellow"><strong>{state.weekly.completedTasks}</strong><span>完成任务</span></Card><Card color="app-orange"><strong>{state.weekly.coinsEarned}</strong><span>获得星币</span></Card><Card color="app-green"><strong>{state.weekly.streak}</strong><span>连续天数</span></Card></div><h2 className="subheading">我的徽章</h2><div className="badge-grid">{state.weekly.badges.map((badge) => <Card className={badge.earned ? "badge-card earned" : "badge-card"} key={badge.key}><span aria-hidden="true">{badge.earned ? "🌟" : "○"}</span><div><strong>{badge.title}</strong><p>{badge.description}</p></div></Card>)}</div></section>;
    return <section className="page-section standalone" aria-labelledby="records-title"><div className="section-heading"><div><p className="eyebrow">最近变化</p><Title color="app-teal" size="large">记录</Title></div></div><div className="record-columns"><Card><h2>任务</h2><ul className="record-list">{state.recent.completions.map((item) => <li key={item.id}><span><strong>{item.title}</strong><small>{item.date} · {item.status === "approved" ? "已确认" : item.status === "pending" ? "待确认" : "已撤销"}</small></span><b>+{item.points}</b></li>)}</ul></Card><Card><h2>星币</h2><ul className="record-list">{state.recent.transactions.map((item) => <li key={item.id}><span><strong>{item.reason}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></span><b className={item.amount < 0 ? "negative" : ""}>{item.amount > 0 ? "+" : ""}{item.amount}</b></li>)}</ul></Card><Card><h2>兑换</h2><ul className="record-list">{state.recent.redemptions.map((item) => <li key={item.id}><span><strong>{item.title}</strong><small>{item.status === "pending" ? "等待兑现" : item.status === "fulfilled" ? "已兑现" : "已取消"}</small></span><b>-{item.cost}</b></li>)}</ul></Card></div></section>;
  }, [busy, completed, heroMessage, heroMessageIndex, motionReduced, pendingAction, progress, state, target, taskCount, view]);

  return <div className={state.family.animationsEnabled ? "app-shell" : "app-shell reduce-motion"}>
    <MotionPreference enabled={state.family.animationsEnabled} />
    <header className="kid-header"><TransitionLink className="brand" href="/" motionEnabled={state.family.animationsEnabled}><span className="brand-icon" aria-hidden="true"><Icon name="icon-miles" size={30} /></span><strong>{state.family.name}</strong></TransitionLink><TransitionLink className="parent-link" href="/admin" motionEnabled={state.family.animationsEnabled}>家长入口</TransitionLink></header>
    <main id="main-content"><div aria-labelledby={`child-tab-${view}`} className="child-view-transition" id={`child-panel-${view}`} key={view} role="tabpanel">{currentContent}</div></main>
    <nav aria-label="孩子端主导航" className="bottom-nav" role="tablist">{nav.map((item, index) => <Button aria-controls={`child-panel-${item.key}`} aria-selected={view === item.key} className="dock-button" htmlType="button" icon={<Icon bounce={!motionReduced} name={item.icon} size={32} />} id={`child-tab-${item.key}`} key={item.key} onClick={() => selectView(item.key)} onKeyDown={(event) => handleNavKeyDown(event, index)} role="tab" size="large" tabIndex={view === item.key ? 0 : -1} type={view === item.key ? "primary" : "text"}>{item.label}</Button>)}</nav>
    <SiteFooter />
    <Modal footer={<><Button disabled={busy} htmlType="button" onClick={() => setRedeeming(null)}>返回</Button><Button disabled={busy} htmlType="button" onClick={async () => { if (!redeeming) return; const completedAction = await action({ action: "redeemReward", rewardId: redeeming.id, idempotencyKey: createIdempotencyKey() }, "兑换成功，等家长兑现吧", `redeem:${redeeming.id}`); if (completedAction) setRedeeming(null); }} type="primary">{pendingAction?.startsWith("redeem:") ? "兑换中…" : "确认兑换"}</Button></>} onClose={() => { if (!busy) setRedeeming(null); }} open={Boolean(redeeming)} title="确认兑换" typewriter={false}>{redeeming ? <p>使用 {redeeming.cost} 枚星币兑换“{redeeming.title}”吗？</p> : null}</Modal>
    <Modal footer={<><Button disabled={busy} htmlType="button" onClick={() => setCancelling(null)}>先不取消</Button><Button danger disabled={busy} htmlType="button" onClick={async () => { if (!cancelling?.completionId) return; const completedAction = await action({ action: "cancelPendingCompletion", completionId: cancelling.completionId, idempotencyKey: createIdempotencyKey() }, "已取消，可以重新完成", `cancel:${cancelling.completionId}`); if (completedAction) setCancelling(null); }} type="primary">{pendingAction?.startsWith("cancel:") ? "取消中…" : "确认取消"}</Button></>} onClose={() => { if (!busy) setCancelling(null); }} open={Boolean(cancelling)} title="取消完成记录" typewriter={false}><p>只会取消等待家长确认的记录，不会产生星币变化。</p></Modal>
  </div>;
}
