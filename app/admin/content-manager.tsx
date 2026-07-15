"use client";

import { useState } from "react";
import { Button, Card, Collapse, Input, Select, Switch, Tag } from "animal-island-ui";
import type { AdminState } from "@/lib/contracts";
import { createIdempotencyKey } from "@/lib/client-id";

type AdminAction = (value: Record<string, unknown>, message?: string) => Promise<boolean>;
type ContentKind = "all" | "task" | "schedule" | "reward";
type CreateKind = Exclude<ContentKind, "all">;
type DeleteContent = { action: "deleteTask" | "deleteSchedule" | "deleteReward"; id: number; title: string };
type StoredSchedule = AdminState["schedules"][number];

type ScheduleGroup = {
  key: string;
  scheduleType: "weekly" | "date";
  weekdays: number[];
  specificDate: string;
  startTime: string;
  endTime: string;
  reminder: boolean;
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function newScheduleGroup(): ScheduleGroup {
  return { key: createIdempotencyKey(), scheduleType: "weekly", weekdays: [1], specificDate: "", startTime: "18:00", endTime: "18:20", reminder: true };
}

function groupTaskSchedules(schedules: StoredSchedule[]): ScheduleGroup[] {
  const groups = new Map<string, ScheduleGroup>();
  for (const schedule of schedules) {
    if (schedule.scheduleType === "date") {
      const key = `date:${schedule.id}`;
      groups.set(key, { key, scheduleType: "date", weekdays: [], specificDate: schedule.specificDate ?? "", startTime: schedule.startTime, endTime: schedule.endTime, reminder: schedule.reminder });
      continue;
    }
    const signature = `weekly:${schedule.startTime}:${schedule.endTime}:${schedule.reminder}`;
    const group = groups.get(signature) ?? { key: signature, scheduleType: "weekly" as const, weekdays: [], specificDate: "", startTime: schedule.startTime, endTime: schedule.endTime, reminder: schedule.reminder };
    if (schedule.weekday !== null && !group.weekdays.includes(schedule.weekday)) group.weekdays.push(schedule.weekday);
    group.weekdays.sort();
    groups.set(signature, group);
  }
  return [...groups.values()];
}

function scheduleSummary(schedules: StoredSchedule[]) {
  if (!schedules.length) return "未安排";
  const groups = groupTaskSchedules(schedules);
  return groups.map((group) => group.scheduleType === "date"
    ? `${group.specificDate} ${group.startTime}`
    : `周${group.weekdays.map((day) => weekdayLabels[day]).join("、")} ${group.startTime}`
  ).join(" · ");
}

function standaloneSummary(schedule: StoredSchedule) {
  const date = schedule.scheduleType === "date" ? schedule.specificDate : `周${weekdayLabels[schedule.weekday ?? 1]}`;
  return `${date} ${schedule.startTime}–${schedule.endTime}`;
}

function ManagerCard({ type, title, meta, deleteLabel, onDelete, children }: { type: string; title: string; meta: string; deleteLabel: string; onDelete: () => void; children: React.ReactNode }) {
  return <div className="collapsible-editor content-item"><Collapse answer={children} question={<span className="collapse-summary"><span className="content-summary-title"><Tag color="app-teal" variant="outlined">{type}</Tag><strong>{title}</strong></span><small>{meta}</small></span>} /><Button aria-label={deleteLabel} className="collapse-delete" danger htmlType="button" onClick={onDelete} size="small" type="default">删除</Button></div>;
}

export function ContentManager({ state, action, setDeleteConfirm }: { state: AdminState; action: AdminAction; setDeleteConfirm: (value: DeleteContent) => void }) {
  const [filter, setFilter] = useState<ContentKind>("all");
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const standaloneSchedules = state.schedules.filter((item) => item.taskId === null);
  const counts = { all: state.tasks.length + standaloneSchedules.length + state.rewards.length, task: state.tasks.length, schedule: standaloneSchedules.length, reward: state.rewards.length };
  const filters: Array<{ key: ContentKind; label: string }> = [{ key: "all", label: "全部" }, { key: "task", label: "任务" }, { key: "schedule", label: "日程" }, { key: "reward", label: "奖励" }];

  return <div className="admin-panel content-manager">
    <div className="content-manager-heading"><div><p className="eyebrow">任务、时间和奖励统一管理</p><h2>成长内容</h2></div><Button htmlType="button" onClick={() => setCreateKind(createKind ? null : "task")} type="primary">{createKind ? "收起新增" : "新增内容"}</Button></div>
    {createKind ? <div className="content-create-area"><div aria-label="选择新增内容类型" className="content-type-switch" role="group">{(["task", "schedule", "reward"] as CreateKind[]).map((kind) => <Button aria-pressed={createKind === kind} htmlType="button" key={kind} onClick={() => setCreateKind(kind)} size="small" type={createKind === kind ? "primary" : "default"}>{kind === "task" ? "任务" : kind === "schedule" ? "日程" : "奖励"}</Button>)}</div>{createKind === "task" ? <TaskPlanEditor action={action} onSaved={() => setCreateKind(null)} /> : createKind === "schedule" ? <StandaloneScheduleEditor action={action} onSaved={() => setCreateKind(null)} /> : <RewardEditor action={action} onSaved={() => setCreateKind(null)} />}</div> : null}
    <div aria-label="成长内容筛选" className="content-filter" role="group">{filters.map((item) => <Button aria-pressed={filter === item.key} htmlType="button" key={item.key} onClick={() => setFilter(item.key)} size="small" type={filter === item.key ? "primary" : "text"}>{item.label} {counts[item.key]}</Button>)}</div>
    <div className="content-list">
      {(filter === "all" || filter === "task") && state.tasks.map((task) => { const schedules = state.schedules.filter((item) => item.taskId === task.id); return <ManagerCard deleteLabel={`删除任务 ${task.title}`} key={`task:${task.id}`} meta={`${task.enabled ? "启用" : "停用"} · ${task.points} 枚 · ${scheduleSummary(schedules)}`} onDelete={() => setDeleteConfirm({ action: "deleteTask", id: task.id, title: `删除任务“${task.title}”？关联安排会同时停用。` })} title={task.title} type="任务"><TaskPlanEditor action={action} initial={task} schedules={schedules} /></ManagerCard>; })}
      {(filter === "all" || filter === "schedule") && standaloneSchedules.map((schedule) => <ManagerCard deleteLabel={`删除日程 ${schedule.title}`} key={`schedule:${schedule.id}`} meta={`${schedule.enabled ? "启用" : "停用"} · ${standaloneSummary(schedule)}`} onDelete={() => setDeleteConfirm({ action: "deleteSchedule", id: schedule.id, title: `删除日程“${schedule.title}”？` })} title={schedule.title} type="日程"><StandaloneScheduleEditor action={action} initial={schedule} /></ManagerCard>)}
      {(filter === "all" || filter === "reward") && state.rewards.map((reward) => <ManagerCard deleteLabel={`删除奖励 ${reward.title}`} key={`reward:${reward.id}`} meta={`${reward.enabled ? "启用" : "停用"} · ${reward.cost} 枚`} onDelete={() => setDeleteConfirm({ action: "deleteReward", id: reward.id, title: `删除奖励“${reward.title}”？兑换历史仍会保留。` })} title={reward.title} type="奖励"><RewardEditor action={action} initial={reward} /></ManagerCard>)}
      {counts[filter] === 0 ? <Card><p className="empty-copy">这里还没有{filter === "all" ? "成长内容" : filter === "task" ? "任务" : filter === "schedule" ? "日程" : "奖励"}。</p></Card> : null}
    </div>
  </div>;
}

function TaskPlanEditor({ action, initial, schedules = [], onSaved }: { action: AdminAction; initial?: AdminState["tasks"][number]; schedules?: StoredSchedule[]; onSaved?: () => void }) {
  const [item, setItem] = useState({ id: initial?.id, title: initial?.title ?? "", childDescription: initial?.childDescription ?? "", points: initial?.points ?? 1, requiresApproval: initial?.requiresApproval ?? false, enabled: initial?.enabled ?? true });
  const [groups, setGroups] = useState<ScheduleGroup[]>(() => initial ? groupTaskSchedules(schedules) : [newScheduleGroup()]);
  const valid = item.title.trim() && item.childDescription.trim() && (!item.enabled || groups.length > 0);

  async function save() {
    const saved = await action({ action: "saveTaskPlan", ...item, schedules: groups.map(({ key: _key, ...group }) => group) }, initial ? "任务和安排已同步更新" : "任务和安排已新增");
    if (saved) onSaved?.();
  }

  return <Card className="editor-card content-editor"><h3>{initial ? "编辑任务" : "新增任务"}</h3><label className="field"><span>任务名称</span><Input value={item.title} onChange={(event) => setItem({ ...item, title: event.target.value })} /></label><label className="field"><span>给孩子看的说明</span><Input value={item.childDescription} onChange={(event) => setItem({ ...item, childDescription: event.target.value })} /></label><label className="field compact-field"><span>完成可得星币</span><Input min="0" type="number" value={item.points} onChange={(event) => setItem({ ...item, points: Number(event.target.value) })} /></label><div className="schedule-group-heading"><strong>时间安排</strong><Button htmlType="button" onClick={() => setGroups([...groups, newScheduleGroup()])} size="small" type="default">添加安排</Button></div><div className="schedule-group-list">{groups.map((group, index) => <ScheduleGroupEditor group={group} index={index} key={group.key} onChange={(next) => setGroups(groups.map((item) => item.key === group.key ? next : item))} onDelete={() => setGroups(groups.filter((item) => item.key !== group.key))} />)}{groups.length === 0 ? <p className="empty-copy">停用任务可以暂时不安排时间。</p> : null}</div><div className="switch-grid compact-switches"><label><Switch checked={item.requiresApproval} onChange={(requiresApproval) => setItem({ ...item, requiresApproval })} size="small" />需家长确认</label><label><Switch checked={item.enabled} onChange={(enabled) => setItem({ ...item, enabled })} size="small" />启用任务</label></div><Button disabled={!valid} htmlType="button" onClick={save} type="primary">保存任务和安排</Button></Card>;
}

function ScheduleGroupEditor({ group, index, onChange, onDelete }: { group: ScheduleGroup; index: number; onChange: (value: ScheduleGroup) => void; onDelete: () => void }) {
  function toggleWeekday(day: number) {
    const weekdays = group.weekdays.includes(day) ? group.weekdays.filter((item) => item !== day) : [...group.weekdays, day].sort();
    onChange({ ...group, weekdays });
  }
  return <div className="schedule-group"><div className="schedule-group-heading"><strong>安排 {index + 1}</strong><Button aria-label={`删除安排 ${index + 1}`} danger htmlType="button" onClick={onDelete} size="small" type="text">删除</Button></div><div className="field"><span>安排方式</span><Select options={[{ key: "weekly", label: "每周固定" }, { key: "date", label: "当天临时" }]} value={group.scheduleType} onChange={(scheduleType) => onChange({ ...group, scheduleType: scheduleType === "date" ? "date" : "weekly" })} /></div>{group.scheduleType === "weekly" ? <div className="field"><span>星期</span><div className="weekday-picker">{weekdayLabels.map((label, day) => <Button aria-pressed={group.weekdays.includes(day)} htmlType="button" key={day} onClick={() => toggleWeekday(day)} size="small" type={group.weekdays.includes(day) ? "primary" : "text"}>{label}</Button>)}</div></div> : <label className="field"><span>日期</span><Input type="date" value={group.specificDate} onChange={(event) => onChange({ ...group, specificDate: event.target.value })} /></label>}<div className="form-row"><label className="field"><span>开始</span><Input type="time" value={group.startTime} onChange={(event) => onChange({ ...group, startTime: event.target.value })} /></label><label className="field"><span>结束</span><Input type="time" value={group.endTime} onChange={(event) => onChange({ ...group, endTime: event.target.value })} /></label></div><label className="switch-row"><Switch checked={group.reminder} onChange={(reminder) => onChange({ ...group, reminder })} size="small" />到点站内提醒</label></div>;
}

function StandaloneScheduleEditor({ action, initial, onSaved }: { action: AdminAction; initial?: StoredSchedule; onSaved?: () => void }) {
  const [item, setItem] = useState({ id: initial?.id, taskId: null, title: initial?.title ?? "", description: initial?.description ?? "", scheduleType: initial?.scheduleType === "date" ? "date" : "weekly", weekday: initial?.weekday ?? 1, specificDate: initial?.specificDate ?? "", startTime: initial?.startTime ?? "18:00", endTime: initial?.endTime ?? "18:20", reminder: initial?.reminder ?? true, enabled: initial?.enabled ?? true, sortOrder: initial?.sortOrder ?? 0 });
  async function save() { if (await action({ action: "saveSchedule", ...item }, initial ? "日程已更新" : "日程已新增")) onSaved?.(); }
  return <Card className="editor-card content-editor"><h3>{initial ? "编辑日程" : "新增日程"}</h3><label className="field"><span>日程名称</span><Input value={item.title} onChange={(event) => setItem({ ...item, title: event.target.value })} /></label><label className="field"><span>给孩子看的说明</span><Input value={item.description} onChange={(event) => setItem({ ...item, description: event.target.value })} /></label><div className="form-row"><div className="field"><span>安排方式</span><Select options={[{ key: "weekly", label: "每周固定" }, { key: "date", label: "当天临时" }]} value={item.scheduleType} onChange={(scheduleType) => setItem({ ...item, scheduleType })} /></div>{item.scheduleType === "weekly" ? <div className="field"><span>星期</span><Select options={weekdayLabels.map((label, day) => ({ key: String(day), label: `星期${label}` }))} value={String(item.weekday)} onChange={(weekday) => setItem({ ...item, weekday: Number(weekday) })} /></div> : <label className="field"><span>日期</span><Input type="date" value={item.specificDate} onChange={(event) => setItem({ ...item, specificDate: event.target.value })} /></label>}</div><div className="form-row"><label className="field"><span>开始</span><Input type="time" value={item.startTime} onChange={(event) => setItem({ ...item, startTime: event.target.value })} /></label><label className="field"><span>结束</span><Input type="time" value={item.endTime} onChange={(event) => setItem({ ...item, endTime: event.target.value })} /></label></div><div className="switch-grid compact-switches"><label><Switch checked={item.reminder} onChange={(reminder) => setItem({ ...item, reminder })} size="small" />站内提醒</label><label><Switch checked={item.enabled} onChange={(enabled) => setItem({ ...item, enabled })} size="small" />启用日程</label></div><Button disabled={!item.title.trim() || !item.description.trim()} htmlType="button" onClick={save} type="primary">保存日程</Button></Card>;
}

function RewardEditor({ action, initial, onSaved }: { action: AdminAction; initial?: AdminState["rewards"][number]; onSaved?: () => void }) {
  const [item, setItem] = useState({ id: initial?.id, title: initial?.title ?? "", description: initial?.description ?? "", cost: initial?.cost ?? 10, enabled: initial?.enabled ?? true });
  async function save() { if (await action({ action: "saveReward", ...item }, initial ? "奖励已更新，历史价格保持不变" : "奖励已新增")) onSaved?.(); }
  return <Card className="editor-card content-editor"><h3>{initial ? "编辑奖励" : "新增奖励"}</h3><label className="field"><span>奖励名称</span><Input value={item.title} onChange={(event) => setItem({ ...item, title: event.target.value })} /></label><label className="field"><span>孩子能理解的说明</span><Input value={item.description} onChange={(event) => setItem({ ...item, description: event.target.value })} /></label><label className="field compact-field"><span>兑换价格</span><Input min="0" type="number" value={item.cost} onChange={(event) => setItem({ ...item, cost: Number(event.target.value) })} /></label><label className="switch-row"><Switch checked={item.enabled} onChange={(enabled) => setItem({ ...item, enabled })} size="small" />启用奖励</label><Button disabled={!item.title.trim() || !item.description.trim()} htmlType="button" onClick={save} type="primary">保存奖励</Button></Card>;
}
