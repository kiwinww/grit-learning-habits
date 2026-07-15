"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title, type TableColumn } from "animal-island-ui";
import { FullscreenLoading } from "@/app/fullscreen-loading";
import { ContentManager } from "@/app/admin/content-manager";
import { SettingsManager } from "@/app/admin/settings-manager";
import { SiteFooter } from "@/app/site-footer";
import { StarWallet } from "@/app/star-wallet";
import { MotionPreference } from "@/app/interaction-shell";
import { shouldReduceMotion, TransitionLink, waitForViewExit } from "@/app/route-transition";
import type { AdminAlertState, AdminState } from "@/lib/contracts";
import { Notification } from "@/lib/animal-notification";

type ConfirmState = { kind: "cancelRedemption" | "revokeCompletion"; id: number; title: string } | null;
type DeleteState = { action: "deleteTask" | "deleteSchedule" | "deleteReward"; id: number; title: string } | null;

async function parseResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "操作没有完成");
  return result;
}

export function AdminPortal() {
  const [state, setState] = useState<AdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const stateRequestRef = useRef(0);
  const [blocking, setBlocking] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteState>(null);
  const [reason, setReason] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [viewLeaving, setViewLeaving] = useState(false);
  const [pendingRedemptionCount, setPendingRedemptionCount] = useState(0);
  const authenticated = state !== null;

  async function swapPortalState(next: AdminState | null, motionEnabled: boolean) {
    if (!shouldReduceMotion(motionEnabled)) {
      setViewLeaving(true);
      await waitForViewExit(motionEnabled);
    }
    setState(next);
    setViewLeaving(false);
  }

  async function load(animate = false) {
    if (!animate) setLoading(true);
    try {
      const response = await fetch("/api/admin/state", { cache: "no-store" });
      const result = await parseResponse(response);
      if (result.authenticated === false) {
        if (animate) await swapPortalState(null, state?.family.animationsEnabled ?? true);
        else setState(null);
        return;
      }
      const next = result as AdminState;
      setPendingRedemptionCount(next.recent.redemptions.filter((item) => item.status === "pending").length);
      if (animate) await swapPortalState(next, next.family.animationsEnabled);
      else setState(next);
    } catch (error) {
      Notification.error({ message: "后台加载失败", description: error instanceof Error ? error.message : "请稍后重试。" });
    } finally { if (!animate) setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    async function refreshAlerts() {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await parseResponse(await fetch("/api/admin/alerts", { cache: "no-store" })) as AdminAlertState;
        if (cancelled) return;
        if (!result.authenticated) {
          setPendingRedemptionCount(0);
          setState(null);
          return;
        }
        setPendingRedemptionCount(result.pendingCount);
        setState((current) => current ? {
          ...current,
          balance: result.balance,
          recent: { ...current.recent, redemptions: result.redemptions }
        } : current);
      } catch {
        // Keep the last known records and retry on the next interval.
      }
    }

    async function refreshAdminState() {
      const requestId = ++stateRequestRef.current;
      try {
        const result = await parseResponse(await fetch("/api/admin/state", { cache: "no-store" }));
        if (cancelled || requestId !== stateRequestRef.current) return;
        if (result.authenticated === false) {
          setPendingRedemptionCount(0);
          setState(null);
          return;
        }
        const next = result as AdminState;
        setPendingRedemptionCount(next.recent.redemptions.filter((item) => item.status === "pending").length);
        setState(next);
      } catch {
        // Keep the current form and retry when the page is focused again.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshAlerts();
        void refreshAdminState();
      }
    }

    void refreshAlerts();
    const timer = window.setInterval(refreshAlerts, 15_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authenticated]);

  async function login(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setBlocking(true);
    try {
      await parseResponse(await fetch("/api/parent/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) }));
      setPin("");
      await load(true);
      Notification.success("已进入家长模式");
    } catch (error) {
      Notification.error({ message: "无法进入后台", description: error instanceof Error ? error.message : "请检查 PIN。" });
    } finally { busyRef.current = false; setBusy(false); setBlocking(false); }
  }

  async function action(payload: Record<string, unknown>, message = "已保存", options: { fullscreen?: boolean } = {}) {
    if (busyRef.current) return false;
    busyRef.current = true;
    stateRequestRef.current += 1;
    setBusy(true);
    if (options.fullscreen) setBlocking(true);
    try {
      const result = await parseResponse(await fetch("/api/admin/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      const next = result as AdminState;
      setPendingRedemptionCount(next.recent.redemptions.filter((item) => item.status === "pending").length);
      setState(next);
      Notification.success(message);
      return true;
    } catch (error) {
      Notification.error({ message: "操作没有完成", description: error instanceof Error ? error.message : "请稍后再试。" });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (options.fullscreen) setBlocking(false);
    }
  }

  async function logout() {
    await fetch("/api/parent/session", { method: "DELETE" });
    await swapPortalState(null, state?.family.animationsEnabled ?? true);
  }

  let portalContent: React.ReactNode;

  if (!state) {
    portalContent = (
      <main className={`parent-login portal-view-transition${viewLeaving ? " view-leaving" : ""}`} id="main-content">
        <Card className="login-card" pattern="app-teal">
          <p className="eyebrow">家长专属区域</p><Title color="app-teal" size="large">输入家长 PIN</Title>
          <p>孩子无法通过修改网址进入这里。连续输错五次会暂时锁定五分钟。</p>
          <form onSubmit={login}><label className="field"><span>4–6 位数字 PIN</span><Input autoFocus inputMode="numeric" maxLength={6} pattern="[0-9]{4,6}" required shadow size="large" type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} /></label><Button block disabled={busy} htmlType="submit" size="large" type="primary">{busy ? "正在验证…" : "进入后台"}</Button></form>
          <TransitionLink className="back-link" href="/">← 返回孩子端</TransitionLink>
        </Card>
      </main>
    );
  } else {

  const tabs = [
    { key: "overview", label: "今日概览", children: <Overview state={state} action={action} pendingRedemptionCount={pendingRedemptionCount} setConfirm={setConfirm} /> },
    { key: "content", label: "成长内容", children: <ContentManager state={state} action={action} setDeleteConfirm={setDeleteConfirm} /> },
    { key: "redemptions", label: <span className="admin-tab-label">兑换{pendingRedemptionCount > 0 ? <span aria-label={`${pendingRedemptionCount} 条待兑现`} className="admin-tab-count">{pendingRedemptionCount}</span> : null}</span>, children: <RedemptionManager state={state} action={action} setConfirm={setConfirm} /> },
    { key: "data", label: "设置", children: <SettingsManager state={state} action={action} /> }
  ];

  portalContent = (
    <div className={`${state.family.animationsEnabled ? "admin-shell" : "admin-shell reduce-motion"} portal-view-transition${viewLeaving ? " view-leaving" : ""}`}>
      <MotionPreference enabled={state.family.animationsEnabled} />
      <header className="admin-header"><TransitionLink className="brand" href="/" motionEnabled={state.family.animationsEnabled}><span aria-hidden="true">★</span><strong>{state.family.name}</strong></TransitionLink><div><TransitionLink className="parent-link" href="/" motionEnabled={state.family.animationsEnabled}>孩子端</TransitionLink><Button htmlType="button" onClick={logout} size="small" type="text">退出家长模式</Button></div></header>
      <main className="admin-main" id="main-content">
        <section className="admin-hero"><div><p className="eyebrow">家长后台</p><h1>今天少催一点，多看见一点</h1><p>所有星币变化都有记录。修改任务只影响未来，不会改写过去。</p></div><Card color="app-teal"><span>当前余额</span><StarWallet size="large" value={state.balance} /></Card></section>
        <div className="admin-tablist" role="tablist" aria-label="家长后台功能">
          {tabs.map((tab, index) => <button aria-controls={`panel-${tab.key}`} aria-selected={activeTab === tab.key} id={`tab-${tab.key}`} key={tab.key} onClick={() => setActiveTab(tab.key)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setActiveTab(tabs[next].key); document.getElementById(`tab-${tabs[next].key}`)?.focus(); }} role="tab" tabIndex={activeTab === tab.key ? 0 : -1} type="button">{tab.label}</button>)}
        </div>
        {tabs.map((tab) => activeTab === tab.key ? <section aria-labelledby={`tab-${tab.key}`} className="admin-tabpanel" id={`panel-${tab.key}`} key={tab.key} role="tabpanel">{tab.children}</section> : null)}
      </main>
      <SiteFooter />
      <Modal footer={<><Button htmlType="button" onClick={() => setConfirm(null)}>返回</Button><Button danger disabled={!reason.trim()} htmlType="button" onClick={() => { if (!confirm) return; action({ action: confirm.kind, id: confirm.id, reason, allowNegative: true }, confirm.kind === "cancelRedemption" ? "已取消并退回星币" : "已撤销并记录流水"); setConfirm(null); setReason(""); }} type="primary">确认操作</Button></>} onClose={() => setConfirm(null)} open={Boolean(confirm)} title="请填写操作原因" typewriter={false}>
        <p>{confirm?.title}</p><label className="field"><span>原因（必填）</span><Input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </Modal>
      <Modal footer={<><Button htmlType="button" onClick={() => setDeleteConfirm(null)}>返回</Button><Button danger htmlType="button" onClick={() => { if (!deleteConfirm) return; action({ action: deleteConfirm.action, id: deleteConfirm.id }, "已删除，历史记录保持不变"); setDeleteConfirm(null); }} type="primary">确认删除</Button></>} onClose={() => setDeleteConfirm(null)} open={Boolean(deleteConfirm)} title="确认删除" typewriter={false}>
        <p>{deleteConfirm?.title}</p><p>删除后不会出现在孩子端，已有历史记录仍会保留。</p>
      </Modal>
    </div>
  );
  }

  return <>
    {portalContent}
    <FullscreenLoading active={loading || blocking} label={loading ? "正在打开家长后台…" : "正在进入家长模式…"} motionEnabled={state?.family.animationsEnabled ?? true} />
  </>;
}

function PanelTitle({ eyebrow, children, color = "app-teal" }: { eyebrow: string; children: React.ReactNode; color?: "app-teal" | "app-yellow" | "app-orange" | "app-green" }) {
  return <div className="panel-title"><p className="eyebrow">{eyebrow}</p><Title color={color} size="large">{children}</Title></div>;
}

function Overview({ state, action, pendingRedemptionCount, setConfirm }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void; pendingRedemptionCount: number; setConfirm: (value: ConfirmState) => void }) {
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState("");
  const [backfillTask, setBackfillTask] = useState(String(state.tasks.find((task) => task.enabled)?.id ?? ""));
  const [countForStreak, setCountForStreak] = useState(false);
  const pendingRedemptions = state.recent.redemptions.filter((item) => item.status === "pending");
  return <div className="admin-panel"><PanelTitle eyebrow="今天最重要的事情">今日概览</PanelTitle><div className="metric-grid"><Card color="app-teal"><strong>{state.balance}</strong><span>星币余额</span></Card><Card color="app-yellow"><strong>{state.schedule.filter((i) => i.status === "approved").length}/{state.schedule.filter((i) => i.taskId).length}</strong><span>今日任务</span></Card><Card color="app-orange"><strong>{pendingRedemptionCount}</strong><span>待兑现</span></Card><Card color="app-green"><strong>{state.pendingCompletions.length}</strong><span>待确认</span></Card></div>
    <Card className="pending-redemptions" pattern="app-yellow"><div className="card-title-row"><div><h2>待兑现奖励</h2><p>孩子兑换后会自动出现在这里。</p></div><Tag color="app-orange" size="large">{pendingRedemptionCount} 条</Tag></div>{pendingRedemptions.length ? <div className="stack-list">{pendingRedemptions.map((item) => <div className="list-row" key={item.id}><span><strong>{item.title}</strong><small>{new Date(item.requestedAt).toLocaleString("zh-CN", { timeZone: state.family.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span><span className="redemption-status"><strong className="redemption-cost">{item.cost} 枚</strong><Tag color="app-yellow">待兑现</Tag></span></div>)}</div> : <p className="empty-copy">暂时没有待兑现奖励。</p>}</Card>
    {state.stabilityHints.length ? <Card color="app-green"><h2>习惯稳定提醒</h2>{state.stabilityHints.map((hint) => <p key={hint.taskId}><strong>{hint.title}</strong>：{hint.message}</p>)}</Card> : null}
    <div className="admin-grid"><Card><h2>待确认任务</h2><div className="stack-list">{state.pendingCompletions.map((item) => <div className="list-row" key={item.id}><span><strong>{item.title}</strong><small>{item.date} · +{item.points}</small></span><Button htmlType="button" onClick={() => action({ action: "approveCompletion", id: item.id }, "任务已确认并发放星币")} size="small" type="primary">确认</Button></div>)}</div></Card>
    <Card><h2>手动调整星币</h2><label className="field"><span>数量（扣除请填负数）</span><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="field"><span>原因</span><Input value={reason} onChange={(e) => setReason(e.target.value)} /></label><Button disabled={!amount || !reason.trim()} htmlType="button" onClick={() => { action({ action: "adjustCoins", amount: Number(amount), reason }, "星币流水已记录"); setAmount(""); setReason(""); }} type="primary">记录调整</Button></Card></div>
    {state.family.allowBackfill ? <Card><h2>补录昨天任务</h2><p>补录保留实际操作时间，默认不计入连续完成。</p><div className="form-row"><div className="field"><span>任务</span><Select options={state.tasks.filter((task) => task.enabled).map((task) => ({ key: String(task.id), label: task.title }))} value={backfillTask} onChange={setBackfillTask} /></div><label className="switch-row"><Switch checked={countForStreak} onChange={setCountForStreak} size="small" />计入连续完成</label></div><Button disabled={!backfillTask} htmlType="button" onClick={() => { const yesterday = new Date(`${state.today}T12:00:00.000Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1); action({ action: "backfill", taskId: Number(backfillTask), businessDate: yesterday.toISOString().slice(0, 10), countForStreak }, "昨天的任务已补录"); }} type="primary">补录昨天</Button></Card> : null}
    <Card><h2>最近完成记录</h2><div className="stack-list">{state.recent.completions.filter((item) => item.status === "approved").map((item) => <div className="list-row" key={item.id}><span><strong>{item.title}</strong><small>{item.date} · +{item.points}</small></span><Button danger htmlType="button" onClick={() => setConfirm({ kind: "revokeCompletion", id: item.id, title: `撤销“${item.title}”会生成 -${item.points} 星币流水，不会删除历史。` })} size="small" type="default">撤销</Button></div>)}</div></Card>
  </div>;
}

function RedemptionManager({ state, action, setConfirm }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void; setConfirm: (value: ConfirmState) => void }) {
  const rows = state.recent.redemptions; const columns: TableColumn<(typeof rows)[number]>[] = [{ title: "奖励", dataIndex: "title" }, { title: "星币", dataIndex: "cost" }, { title: "申请时间", render: (_, row) => new Date(row.requestedAt).toLocaleString("zh-CN", { timeZone: state.family.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) }, { title: "状态", render: (_, row) => row.status === "pending" ? "待兑现" : row.status === "fulfilled" ? "已兑现" : "已取消" }, { title: "操作", render: (_, row) => row.status === "pending" ? <div className="row-actions"><Button htmlType="button" onClick={() => action({ action: "fulfillRedemption", id: row.id }, "奖励已标记为兑现")} size="small" type="primary">已兑现</Button><Button danger htmlType="button" onClick={() => setConfirm({ kind: "cancelRedemption", id: row.id, title: `取消“${row.title}”并退回 ${row.cost} 枚星币。` })} size="small" type="default">取消退款</Button></div> : "—" }];
  return <div className="admin-panel"><PanelTitle color="app-yellow" eyebrow="取消会自动生成退款流水">兑换处理</PanelTitle><Table columns={columns as TableColumn[]} dataSource={rows as unknown as Record<string, unknown>[]} emptyText="还没有兑换记录" rowKey="id" scroll={{ x: 900 }} /></div>;
}
