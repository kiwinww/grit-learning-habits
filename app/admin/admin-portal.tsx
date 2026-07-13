"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, Input, Loading, Modal, Select, Switch, Table, Tag, Title, Wallet, type TableColumn } from "animal-island-ui";
import { SiteFooter } from "@/app/site-footer";
import { MotionPreference } from "@/app/interaction-shell";
import { shouldReduceMotion, TransitionLink, waitForViewExit } from "@/app/route-transition";
import type { AdminState } from "@/lib/contracts";
import { Notification } from "@/lib/animal-notification";

type ConfirmState = { kind: "cancelRedemption" | "revokeCompletion"; id: number; title: string } | null;

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
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [reason, setReason] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [viewLeaving, setViewLeaving] = useState(false);

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
      if (animate) await swapPortalState(next, next.family.animationsEnabled);
      else setState(next);
    } catch (error) {
      Notification.error({ message: "后台加载失败", description: error instanceof Error ? error.message : "请稍后重试。" });
    } finally { if (!animate) setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await parseResponse(await fetch("/api/parent/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) }));
      setPin("");
      await load(true);
      Notification.success("已进入家长模式");
    } catch (error) {
      Notification.error({ message: "无法进入后台", description: error instanceof Error ? error.message : "请检查 PIN。" });
    } finally { setBusy(false); }
  }

  async function action(payload: Record<string, unknown>, message = "已保存") {
    if (busy) return;
    setBusy(true);
    try {
      const result = await parseResponse(await fetch("/api/admin/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      setState(result as AdminState);
      Notification.success(message);
    } catch (error) {
      Notification.error({ message: "操作没有完成", description: error instanceof Error ? error.message : "请稍后再试。" });
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/parent/session", { method: "DELETE" });
    await swapPortalState(null, state?.family.animationsEnabled ?? true);
  }

  if (loading) return <main className="center-page" id="main-content"><Loading active /><p>正在打开家长后台…</p></main>;
  if (!state) {
    return (
      <main className={`parent-login portal-view-transition${viewLeaving ? " view-leaving" : ""}`} id="main-content">
        <Card className="login-card" pattern="app-teal">
          <p className="eyebrow">家长专属区域</p><Title color="app-teal" size="large">输入家长 PIN</Title>
          <p>孩子无法通过修改网址进入这里。连续输错五次会暂时锁定五分钟。</p>
          <form onSubmit={login}><label className="field"><span>4–6 位数字 PIN</span><Input autoFocus inputMode="numeric" maxLength={6} pattern="[0-9]{4,6}" required shadow size="large" type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} /></label><Button block htmlType="submit" loading={busy} size="large" type="primary">进入后台</Button></form>
          <TransitionLink className="back-link" href="/">← 返回孩子端</TransitionLink>
        </Card>
      </main>
    );
  }

  const tabs = [
    { key: "overview", label: "今日概览", children: <Overview state={state} action={action} setConfirm={setConfirm} /> },
    { key: "tasks", label: "任务", children: <TaskManager state={state} action={action} /> },
    { key: "schedule", label: "日程", children: <ScheduleManager state={state} action={action} /> },
    { key: "rewards", label: "奖励", children: <RewardManager state={state} action={action} /> },
    { key: "redemptions", label: "兑换", children: <RedemptionManager state={state} action={action} setConfirm={setConfirm} /> },
    { key: "review", label: "周复盘", children: <ReviewManager state={state} action={action} /> },
    { key: "data", label: "数据与设置", children: <DataManager state={state} action={action} reload={load} /> }
  ];

  return (
    <div className={`${state.family.animationsEnabled ? "admin-shell" : "admin-shell reduce-motion"} portal-view-transition${viewLeaving ? " view-leaving" : ""}`}>
      <MotionPreference enabled={state.family.animationsEnabled} />
      <header className="admin-header"><TransitionLink className="brand" href="/" motionEnabled={state.family.animationsEnabled}><span aria-hidden="true">★</span><strong>{state.family.name}</strong></TransitionLink><div><TransitionLink className="parent-link" href="/" motionEnabled={state.family.animationsEnabled}>孩子端</TransitionLink><Button htmlType="button" onClick={logout} size="small" type="text">退出家长模式</Button></div></header>
      <main className="admin-main" id="main-content">
        <section className="admin-hero"><div><p className="eyebrow">家长后台</p><h1>今天少催一点，多看见一点</h1><p>所有星币变化都有记录。修改任务只影响未来，不会改写过去。</p></div><Card color="app-teal"><span>当前余额</span><Wallet size="large" value={state.balance} /></Card></section>
        <div className="admin-tablist" role="tablist" aria-label="家长后台功能">
          {tabs.map((tab, index) => <button aria-controls={`panel-${tab.key}`} aria-selected={activeTab === tab.key} id={`tab-${tab.key}`} key={tab.key} onClick={() => setActiveTab(tab.key)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; setActiveTab(tabs[next].key); document.getElementById(`tab-${tabs[next].key}`)?.focus(); }} role="tab" tabIndex={activeTab === tab.key ? 0 : -1} type="button">{tab.label}</button>)}
        </div>
        {tabs.map((tab) => activeTab === tab.key ? <section aria-labelledby={`tab-${tab.key}`} className="admin-tabpanel" id={`panel-${tab.key}`} key={tab.key} role="tabpanel">{tab.children}</section> : null)}
      </main>
      <SiteFooter />
      <Loading active={busy} />
      <Modal footer={<><Button htmlType="button" onClick={() => setConfirm(null)}>返回</Button><Button danger disabled={!reason.trim()} htmlType="button" onClick={() => { if (!confirm) return; action({ action: confirm.kind, id: confirm.id, reason, allowNegative: true }, confirm.kind === "cancelRedemption" ? "已取消并退回星币" : "已撤销并记录流水"); setConfirm(null); setReason(""); }} type="primary">确认操作</Button></>} onClose={() => setConfirm(null)} open={Boolean(confirm)} title="请填写操作原因" typewriter={false}>
        <p>{confirm?.title}</p><label className="field"><span>原因（必填）</span><Input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </Modal>
    </div>
  );
}

function PanelTitle({ eyebrow, children, color = "app-teal" }: { eyebrow: string; children: React.ReactNode; color?: "app-teal" | "app-yellow" | "app-orange" | "app-green" }) {
  return <div className="panel-title"><p className="eyebrow">{eyebrow}</p><Title color={color} size="large">{children}</Title></div>;
}

function Overview({ state, action, setConfirm }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void; setConfirm: (value: ConfirmState) => void }) {
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState("");
  const [backfillTask, setBackfillTask] = useState(String(state.tasks.find((task) => task.enabled)?.id ?? ""));
  const [countForStreak, setCountForStreak] = useState(false);
  return <div className="admin-panel"><PanelTitle eyebrow="今天最重要的事情">今日概览</PanelTitle><div className="metric-grid"><Card color="app-teal"><strong>{state.balance}</strong><span>星币余额</span></Card><Card color="app-yellow"><strong>{state.schedule.filter((i) => i.status === "approved").length}/{state.schedule.filter((i) => i.taskId).length}</strong><span>今日任务</span></Card><Card color="app-orange"><strong>{state.recent.redemptions.filter((i) => i.status === "pending").length}</strong><span>待兑现</span></Card><Card color="app-green"><strong>{state.pendingCompletions.length}</strong><span>待确认</span></Card></div>
    {state.stabilityHints.length ? <Card color="app-green"><h2>习惯稳定提醒</h2>{state.stabilityHints.map((hint) => <p key={hint.taskId}><strong>{hint.title}</strong>：{hint.message}</p>)}</Card> : null}
    <div className="admin-grid"><Card><h2>待确认任务</h2><div className="stack-list">{state.pendingCompletions.map((item) => <div className="list-row" key={item.id}><span><strong>{item.title}</strong><small>{item.date} · +{item.points}</small></span><Button htmlType="button" onClick={() => action({ action: "approveCompletion", id: item.id }, "任务已确认并发放星币")} size="small" type="primary">确认</Button></div>)}</div></Card>
    <Card><h2>手动调整星币</h2><label className="field"><span>数量（扣除请填负数）</span><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="field"><span>原因</span><Input value={reason} onChange={(e) => setReason(e.target.value)} /></label><Button disabled={!amount || !reason.trim()} htmlType="button" onClick={() => { action({ action: "adjustCoins", amount: Number(amount), reason }, "星币流水已记录"); setAmount(""); setReason(""); }} type="primary">记录调整</Button></Card></div>
    {state.family.allowBackfill ? <Card><h2>补录昨天任务</h2><p>补录保留实际操作时间，默认不计入连续完成。</p><div className="form-row"><div className="field"><span>任务</span><Select options={state.tasks.filter((task) => task.enabled).map((task) => ({ key: String(task.id), label: task.title }))} value={backfillTask} onChange={setBackfillTask} /></div><label className="switch-row"><Switch checked={countForStreak} onChange={setCountForStreak} size="small" />计入连续完成</label></div><Button disabled={!backfillTask} htmlType="button" onClick={() => { const yesterday = new Date(`${state.today}T12:00:00.000Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1); action({ action: "backfill", taskId: Number(backfillTask), businessDate: yesterday.toISOString().slice(0, 10), countForStreak }, "昨天的任务已补录"); }} type="primary">补录昨天</Button></Card> : null}
    <Card><h2>最近完成记录</h2><div className="stack-list">{state.recent.completions.filter((item) => item.status === "approved").map((item) => <div className="list-row" key={item.id}><span><strong>{item.title}</strong><small>{item.date} · +{item.points}</small></span><Button danger htmlType="button" onClick={() => setConfirm({ kind: "revokeCompletion", id: item.id, title: `撤销“${item.title}”会生成 -${item.points} 星币流水，不会删除历史。` })} size="small" type="default">撤销</Button></div>)}</div></Card>
  </div>;
}

function TaskManager({ state, action }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void }) {
  return <div className="admin-panel"><PanelTitle color="app-green" eyebrow="控制未来的任务规则">任务管理</PanelTitle><TaskEditor action={action} /><div className="editor-grid">{state.tasks.map((task) => <TaskEditor action={action} initial={task} key={task.id} />)}</div></div>;
}

function TaskEditor({ action, initial }: { action: (value: Record<string, unknown>, message?: string) => void; initial?: AdminState["tasks"][number] }) {
  const [item, setItem] = useState(initial ?? { id: undefined, title: "", childDescription: "", category: "learning", points: 1, requiresApproval: false, isCore: false, enabled: true, sortOrder: 0, habitStage: "starter" });
  return <Card className="editor-card"><h2>{initial ? initial.title : "新增任务"}</h2><label className="field"><span>任务名称</span><Input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} /></label><label className="field"><span>给孩子看的说明</span><Input value={item.childDescription} onChange={(e) => setItem({ ...item, childDescription: e.target.value })} /></label><div className="form-row"><label className="field"><span>星币</span><Input min="0" type="number" value={item.points} onChange={(e) => setItem({ ...item, points: Number(e.target.value) })} /></label><div className="field"><span>阶段</span><Select options={[{ key: "starter", label: "启动期" }, { key: "stable", label: "稳定期" }, { key: "autonomous", label: "自主期" }]} value={item.habitStage} onChange={(habitStage) => setItem({ ...item, habitStage })} /></div></div><div className="switch-grid"><label><Switch checked={item.requiresApproval} onChange={(requiresApproval) => setItem({ ...item, requiresApproval })} size="small" />需家长确认</label><label><Switch checked={item.isCore} onChange={(isCore) => setItem({ ...item, isCore })} size="small" />核心任务</label><label><Switch checked={item.enabled} onChange={(enabled) => setItem({ ...item, enabled })} size="small" />启用</label></div><Button disabled={!item.title.trim() || !item.childDescription.trim()} htmlType="button" onClick={() => action({ action: "saveTask", ...item }, initial ? "任务已更新，历史记录保持不变" : "任务已新增")} type="primary">保存任务</Button></Card>;
}

function ScheduleManager({ state, action }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void }) {
  return <div className="admin-panel"><PanelTitle eyebrow="按星期安排，也可以临时加一项">日程设置</PanelTitle><ScheduleEditor action={action} tasks={state.tasks} /><div className="editor-grid">{state.schedules.map((item) => <ScheduleEditor action={action} initial={item} key={item.id} tasks={state.tasks} />)}</div></div>;
}

function ScheduleEditor({ action, initial, tasks }: { action: (value: Record<string, unknown>, message?: string) => void; initial?: AdminState["schedules"][number]; tasks: AdminState["tasks"] }) {
  const [item, setItem] = useState(initial ?? { id: undefined, taskId: null as number | null, title: "", description: "", scheduleType: "weekly", weekday: 1 as number | null, specificDate: "", startTime: "18:00", endTime: "18:20", reminder: true, enabled: true, sortOrder: 0 });
  const taskOptions = [{ key: "none", label: "仅提醒，不发星币" }, ...tasks.filter((t) => t.enabled).map((t) => ({ key: String(t.id), label: `${t.title}（${t.points}币）` }))];
  return <Card className="editor-card"><h2>{initial ? initial.title : "新增日程"}</h2><div className="field"><span>关联任务</span><Select options={taskOptions} value={item.taskId ? String(item.taskId) : "none"} onChange={(key) => { const task = tasks.find((t) => t.id === Number(key)); setItem({ ...item, taskId: task?.id ?? null, title: item.title || task?.title || "", description: item.description || task?.childDescription || "" }); }} /></div><label className="field"><span>标题</span><Input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} /></label><label className="field"><span>说明</span><Input value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></label><div className="form-row"><div className="field"><span>类型</span><Select options={[{ key: "weekly", label: "每周固定" }, { key: "date", label: "当天临时" }]} value={item.scheduleType} onChange={(scheduleType) => setItem({ ...item, scheduleType })} /></div>{item.scheduleType === "weekly" ? <div className="field"><span>星期</span><Select options={["日","一","二","三","四","五","六"].map((v,i)=>({key:String(i),label:`星期${v}`}))} value={String(item.weekday ?? 1)} onChange={(key) => setItem({ ...item, weekday: Number(key) })} /></div> : <label className="field"><span>日期</span><Input type="date" value={item.specificDate ?? ""} onChange={(e) => setItem({ ...item, specificDate: e.target.value })} /></label>}</div><div className="form-row"><label className="field"><span>开始</span><Input type="time" value={item.startTime} onChange={(e) => setItem({ ...item, startTime: e.target.value })} /></label><label className="field"><span>结束</span><Input type="time" value={item.endTime} onChange={(e) => setItem({ ...item, endTime: e.target.value })} /></label></div><div className="switch-grid"><label><Switch checked={item.reminder} onChange={(reminder) => setItem({ ...item, reminder })} size="small" />站内提醒</label><label><Switch checked={item.enabled} onChange={(enabled) => setItem({ ...item, enabled })} size="small" />启用</label></div><Button disabled={!item.title.trim() || !item.description.trim()} htmlType="button" onClick={() => action({ action: "saveSchedule", ...item }, "日程已经保存")} type="primary">保存日程</Button></Card>;
}

function RewardManager({ state, action }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void }) {
  return <div className="admin-panel"><PanelTitle color="app-orange" eyebrow="优先选择陪伴、体验与选择权">奖励管理</PanelTitle><RewardEditor action={action} /><div className="editor-grid">{state.rewards.map((reward) => <RewardEditor action={action} initial={reward} key={reward.id} />)}</div></div>;
}

function RewardEditor({ action, initial }: { action: (value: Record<string, unknown>, message?: string) => void; initial?: AdminState["rewards"][number] }) {
  const [item, setItem] = useState<{ id?: number; title: string; description: string; cost: number; category: string; enabled: boolean; dailyLimit: number | null; weeklyLimit: number | null }>(initial ?? { id: undefined, title: "", description: "", cost: 10, category: "亲子陪伴", enabled: true, dailyLimit: null, weeklyLimit: null });
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) { if (!initial) return; setUploading(true); const form = new FormData(); form.set("image", file); try { await parseResponse(await fetch(`/api/admin/rewards/${initial.id}/image`, { method: "POST", body: form })); Notification.success("奖励图片已压缩并保存"); } catch (e) { Notification.error({ message: "图片上传失败", description: e instanceof Error ? e.message : "请重试" }); } finally { setUploading(false); } }
  return <Card className="editor-card"><h2>{initial ? initial.title : "新增奖励"}</h2><label className="field"><span>奖励名称</span><Input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} /></label><label className="field"><span>孩子能理解的说明</span><Input value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></label><div className="form-row"><label className="field"><span>价格</span><Input min="0" type="number" value={item.cost} onChange={(e) => setItem({ ...item, cost: Number(e.target.value) })} /></label><label className="field"><span>分类</span><Input value={item.category} onChange={(e) => setItem({ ...item, category: e.target.value })} /></label></div><div className="form-row"><label className="field"><span>每日限兑（留空不限）</span><Input min="1" type="number" value={item.dailyLimit ?? ""} onChange={(e) => setItem({ ...item, dailyLimit: Number(e.target.value) || null })} /></label><label className="field"><span>每周限兑（留空不限）</span><Input min="1" type="number" value={item.weeklyLimit ?? ""} onChange={(e) => setItem({ ...item, weeklyLimit: Number(e.target.value) || null })} /></label></div><label className="switch-row"><Switch checked={item.enabled} onChange={(enabled) => setItem({ ...item, enabled })} size="small" />启用奖励</label>{initial ? <label className="field"><span>奖励图片（2MB 内）</span><input accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => { const file=e.target.files?.[0]; if(file) upload(file); }} type="file" /></label> : <small>先保存奖励，再上传图片。</small>}<Button disabled={!item.title.trim() || !item.description.trim()} htmlType="button" onClick={() => action({ action: "saveReward", ...item }, initial ? "奖励已更新，历史价格保持不变" : "奖励已新增")} type="primary">保存奖励</Button></Card>;
}

function RedemptionManager({ state, action, setConfirm }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void; setConfirm: (value: ConfirmState) => void }) {
  const rows = state.recent.redemptions; const columns: TableColumn<(typeof rows)[number]>[] = [{ title: "奖励", dataIndex: "title" }, { title: "星币", dataIndex: "cost" }, { title: "状态", render: (_, row) => row.status === "pending" ? "待兑现" : row.status === "fulfilled" ? "已兑现" : "已取消" }, { title: "操作", render: (_, row) => row.status === "pending" ? <div className="row-actions"><Button htmlType="button" onClick={() => action({ action: "fulfillRedemption", id: row.id }, "奖励已标记为兑现")} size="small" type="primary">已兑现</Button><Button danger htmlType="button" onClick={() => setConfirm({ kind: "cancelRedemption", id: row.id, title: `取消“${row.title}”并退回 ${row.cost} 枚星币。` })} size="small" type="default">取消退款</Button></div> : "—" }];
  return <div className="admin-panel"><PanelTitle color="app-yellow" eyebrow="取消会自动生成退款流水">兑换处理</PanelTitle><Table columns={columns as TableColumn[]} dataSource={rows as unknown as Record<string, unknown>[]} emptyText="还没有兑换记录" rowKey="id" scroll={{ x: 720 }} /></div>;
}

function ReviewManager({ state, action }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void }) {
  const existing = state.reviews.find((review) => review.weekStart === state.weekly.start); const [review, setReview] = useState(existing ?? { weekStart: state.weekly.start, weekEnd: state.weekly.end, wins: "", difficulties: "", nextFocus: "" });
  const history = state.reviews.filter((item) => item.weekStart !== state.weekly.start);
  return <div className="admin-panel"><PanelTitle color="app-green" eyebrow={`${state.weekly.start} 至 ${state.weekly.end}`}>本周复盘</PanelTitle><div className="metric-grid"><Card color="app-teal"><strong>{state.weekly.completedDays}</strong><span>有效天数</span></Card><Card color="app-yellow"><strong>{state.weekly.completedTasks}</strong><span>完成任务</span></Card><Card color="app-orange"><strong>{state.weekly.coinsEarned}</strong><span>获得星币</span></Card><Card color="app-green"><strong>{state.weekly.streak}</strong><span>连续天数</span></Card></div><Card><label className="field"><span>本周做得好的地方</span><textarea value={review.wins} onChange={(e) => setReview({ ...review, wins: e.target.value })} /></label><label className="field"><span>主要困难</span><textarea value={review.difficulties} onChange={(e) => setReview({ ...review, difficulties: e.target.value })} /></label><label className="field"><span>下周重点</span><textarea value={review.nextFocus} onChange={(e) => setReview({ ...review, nextFocus: e.target.value })} /></label><Button htmlType="button" onClick={() => action({ action: "saveReview", ...review }, "周复盘已保存")} type="primary">保存复盘</Button></Card>{history.length ? <section><h2>历史复盘</h2><div className="editor-grid">{history.map((item) => <Card key={item.weekStart}><h3>{item.weekStart} 至 {item.weekEnd}</h3><p><strong>做得好：</strong>{item.wins || "—"}</p><p><strong>困难：</strong>{item.difficulties || "—"}</p><p><strong>下周重点：</strong>{item.nextFocus || "—"}</p></Card>)}</div></section> : null}</div>;
}

function DataManager({ state, action, reload }: { state: AdminState; action: (value: Record<string, unknown>, message?: string) => void; reload: () => void }) {
  const [settings, setSettings] = useState({ familyName: state.family.name, timezone: state.family.timezone, animationsEnabled: state.family.animationsEnabled, allowBackfill: state.family.allowBackfill }); const [oldPin, setOldPin] = useState(""); const [newPin, setNewPin] = useState("");
  async function importBackup(file: File) { try { const payload = JSON.parse(await file.text()); await parseResponse(await fetch("/api/admin/backup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })); await reload(); Notification.success("备份已恢复"); } catch (e) { Notification.error({ message: "恢复失败", description: e instanceof Error ? e.message : "文件格式不正确" }); } }
  return <div className="admin-panel"><PanelTitle eyebrow="备份、时区和访问设置">数据与设置</PanelTitle><div className="admin-grid"><Card><h2>家庭设置</h2><label className="field"><span>家庭名称</span><Input value={settings.familyName} onChange={(e) => setSettings({ ...settings, familyName: e.target.value })} /></label><div className="field"><span>家庭时区</span><Select options={[{key:"Asia/Hong_Kong",label:"香港 / 北京时间"},{key:"Asia/Shanghai",label:"中国标准时间"},{key:"Asia/Taipei",label:"台北时间"},{key:"Asia/Singapore",label:"新加坡时间"}]} value={settings.timezone} onChange={(timezone) => setSettings({ ...settings, timezone })} /></div><label className="switch-row"><Switch checked={settings.animationsEnabled} onChange={(animationsEnabled) => setSettings({ ...settings, animationsEnabled })} size="small" />启用短暂反馈动画</label><label className="switch-row"><Switch checked={settings.allowBackfill} onChange={(allowBackfill) => setSettings({ ...settings, allowBackfill })} size="small" />允许补录昨天任务</label><Button htmlType="button" onClick={() => action({ action: "saveSettings", ...settings }, "家庭设置已保存")} type="primary">保存设置</Button></Card><Card><h2>家长 PIN</h2><label className="field"><span>当前 PIN</span><Input inputMode="numeric" maxLength={6} type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g,""))} /></label><label className="field"><span>新的 4–6 位 PIN</span><Input inputMode="numeric" maxLength={6} type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g,""))} /></label><Button danger disabled={!/^\d{4,6}$/.test(oldPin) || !/^\d{4,6}$/.test(newPin)} htmlType="button" onClick={() => action({ action: "changePin", oldPin, pin: newPin }, "PIN 已修改，请重新登录")} type="default">修改 PIN</Button></Card><Card><h2>完整备份</h2><p>JSON 备份包含任务、流水、复盘和奖励图片。请由家长妥善保存。</p><a className="download-button" href="/api/admin/backup">导出完整备份</a><label className="field"><span>导入备份</span><input accept="application/json" onChange={(e) => { const file=e.target.files?.[0]; if(file && window.confirm("导入将替换当前业务数据，继续吗？")) importBackup(file); }} type="file" /></label></Card><Card><h2>隐私说明</h2><p>孩子端按你的选择保持公开可访问；管理操作仍需 PIN。站点不接入广告、分析或第三方追踪。</p><Tag color="app-yellow" variant="outlined">禁止搜索引擎收录</Tag></Card></div></div>;
}
