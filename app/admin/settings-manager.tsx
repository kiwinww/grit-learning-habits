"use client";

import { useState } from "react";
import { Button, Card, Input, Select, Switch, Tag, Title } from "animal-island-ui";
import type { AdminState } from "@/lib/contracts";
import { createIdempotencyKey } from "@/lib/client-id";

type AdminAction = (value: Record<string, unknown>, message?: string, options?: { fullscreen?: boolean }) => Promise<boolean>;

export function SettingsManager({ state, action }: { state: AdminState; action: AdminAction }) {
  const [settings, setSettings] = useState({ familyName: state.family.name, timezone: state.family.timezone, animationsEnabled: state.family.animationsEnabled, allowBackfill: state.family.allowBackfill, heroMessages: state.family.heroMessages });
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [resetScope, setResetScope] = useState("task");
  const [resetTarget, setResetTarget] = useState(String(state.resetOptions.tasks[0]?.id ?? ""));
  const [resetPin, setResetPin] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const taskImpact = state.resetOptions.tasks.find((item) => String(item.id) === resetTarget);
  const rewardImpact = state.resetOptions.rewards.find((item) => String(item.id) === resetTarget);
  const estimatedBalance = resetScope === "all" ? 0 : resetScope === "task" ? state.balance - (taskImpact?.ledgerAmount ?? 0) : state.balance - (rewardImpact?.ledgerAmount ?? 0);
  const impactText = resetScope === "task" ? `删除 ${taskImpact?.completionCount ?? 0} 条完成记录` : resetScope === "reward" ? `删除 ${rewardImpact?.redemptionCount ?? 0} 条兑换记录` : `删除 ${state.resetOptions.total.completionCount} 条完成和 ${state.resetOptions.total.redemptionCount} 条兑换记录`;

  function saveSettings(message: string) {
    return action({ action: "saveSettings", ...settings }, message);
  }

  return <div className="admin-panel settings-manager"><div className="panel-title"><p className="eyebrow">备份、时区和访问设置</p><Title color="app-teal" size="large">数据与设置</Title></div>
    <div className="admin-grid settings-grid">
      <Card><h2>家庭设置</h2><label className="field"><span>家庭名称</span><Input value={settings.familyName} onChange={(event) => setSettings({ ...settings, familyName: event.target.value })} /></label><div className="field"><span>家庭时区</span><Select options={[{ key: "Asia/Hong_Kong", label: "香港 / 北京时间" }, { key: "Asia/Shanghai", label: "中国标准时间" }, { key: "Asia/Taipei", label: "台北时间" }, { key: "Asia/Singapore", label: "新加坡时间" }]} value={settings.timezone} onChange={(timezone) => setSettings({ ...settings, timezone })} /></div><div className="switch-grid compact-switches"><label><Switch checked={settings.animationsEnabled} onChange={(animationsEnabled) => setSettings({ ...settings, animationsEnabled })} size="small" />启用短暂反馈动画</label><label><Switch checked={settings.allowBackfill} onChange={(allowBackfill) => setSettings({ ...settings, allowBackfill })} size="small" />允许补录昨天任务</label></div><Button htmlType="button" onClick={() => saveSettings("家庭设置已保存")} type="primary">保存设置</Button></Card>
      <Card><h2>家长 PIN</h2><label className="field"><span>当前 PIN</span><Input inputMode="numeric" maxLength={6} type="password" value={oldPin} onChange={(event) => setOldPin(event.target.value.replace(/\D/g, ""))} /></label><label className="field"><span>新的 4–6 位 PIN</span><Input inputMode="numeric" maxLength={6} type="password" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} /></label><Button danger disabled={!/^\d{4,6}$/.test(oldPin) || !/^\d{4,6}$/.test(newPin)} htmlType="button" onClick={() => action({ action: "changePin", oldPin, pin: newPin }, "PIN 已修改，请重新登录")} type="default">修改 PIN</Button></Card>
      <Card className="settings-wide-card"><h2>孩子端首页文案</h2><p>标题可使用 <code>{"{nickname}"}</code> 插入昵称。</p>{settings.heroMessages.map((message, index) => <div className="hero-message-row" key={index}><label className="field"><span>标题 {index + 1}</span><Input maxLength={36} value={message.title} onChange={(event) => setSettings({ ...settings, heroMessages: settings.heroMessages.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /></label><label className="field"><span>副标题</span><Input maxLength={60} value={message.subtitle} onChange={(event) => setSettings({ ...settings, heroMessages: settings.heroMessages.map((item, itemIndex) => itemIndex === index ? { ...item, subtitle: event.target.value } : item) })} /></label><Button aria-label={`删除第 ${index + 1} 组首页文案`} danger disabled={settings.heroMessages.length === 1} htmlType="button" onClick={() => setSettings({ ...settings, heroMessages: settings.heroMessages.filter((_, itemIndex) => itemIndex !== index) })} size="small" type="default">删除</Button></div>)}<div className="row-actions"><Button disabled={settings.heroMessages.length >= 8} htmlType="button" onClick={() => setSettings({ ...settings, heroMessages: [...settings.heroMessages, { title: "{nickname}，今天准备做什么？", subtitle: "先完成一件小事。" }] })} type="default">新增一组</Button><Button htmlType="button" onClick={() => saveSettings("首页文案已保存")} type="primary">保存首页文案</Button></div></Card>
      <Card><h2>隐私说明</h2><p>孩子端按你的选择保持公开可访问；管理操作仍需 PIN。站点不接入广告、分析或第三方追踪。</p><Tag color="app-yellow" variant="outlined">禁止搜索引擎收录</Tag></Card>
    </div>
    <Card className="settings-danger-card"><h2>危险操作：数据重置</h2><p>执行前会自动保存完整备份。任务、奖励和家庭设置不会被删除。</p><div className="field"><span>重置范围</span><Select options={[{ key: "task", label: "指定任务历史" }, { key: "reward", label: "指定奖励历史" }, { key: "all", label: "全部成长数据" }]} value={resetScope} onChange={(scope) => { setResetScope(scope); setResetTarget(scope === "reward" ? String(state.resetOptions.rewards[0]?.id ?? "") : String(state.resetOptions.tasks[0]?.id ?? "")); }} /></div>{resetScope === "task" ? <div className="field"><span>任务</span><Select options={state.resetOptions.tasks.map((item) => ({ key: String(item.id), label: item.title }))} value={resetTarget} onChange={setResetTarget} /></div> : resetScope === "reward" ? <div className="field"><span>奖励</span><Select options={state.resetOptions.rewards.map((item) => ({ key: String(item.id), label: item.title }))} value={resetTarget} onChange={setResetTarget} /></div> : null}<div className="reset-impact"><strong>{impactText}</strong><span>预计余额：{estimatedBalance} 枚</span></div><label className="field"><span>当前 PIN</span><Input inputMode="numeric" maxLength={6} type="password" value={resetPin} onChange={(event) => setResetPin(event.target.value.replace(/\D/g, ""))} /></label><label className="field"><span>输入“确认重置”</span><Input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} /></label><Button block danger disabled={!/^\d{4,6}$/.test(resetPin) || resetConfirmation !== "确认重置" || (resetScope !== "all" && !resetTarget)} htmlType="button" onClick={() => action({ action: "resetBusinessData", scope: resetScope, targetId: resetTarget ? Number(resetTarget) : undefined, pin: resetPin, confirmation: resetConfirmation, idempotencyKey: createIdempotencyKey() }, "数据已重置，操作前备份已保存", { fullscreen: true })} type="primary">执行重置</Button></Card>
  </div>;
}
