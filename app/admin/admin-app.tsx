"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { imageAssets } from "@/lib/assets";
import {
  commitStaticAdminState,
  loadStaticAdminState,
  resetStaticDemoRecords,
  scheduleFromTemplate
} from "@/lib/static-pages-state";
import type { AdminState, WeeklyReviewView } from "@/lib/types";
import { formatDateTime } from "@/lib/dates";

type Props = {
  initialState: AdminState;
  initialWeeklyReview?: WeeklyReviewView | null;
  staticMode?: boolean;
};

type TemplateBlock = AdminState["templates"][number]["blocks"][number];
type TaskItem = AdminState["tasks"][number];
type RewardItem = AdminState["rewards"][number];
type JsonValue = string | number | boolean | null | Array<unknown>;
type JsonRecord = Record<string, JsonValue>;
type RewardImageDraft = {
  file: File;
  previewUrl: string;
};
type RewardCreateResponse = {
  reward: {
    id: number;
  };
};
type WeeklyReviewResponse = WeeklyReviewView;

async function sendJson(url: string, method: "POST" | "PATCH", body: JsonRecord) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "保存失败");
  }

  return data;
}

async function sendRewardImage(rewardId: number, file: File) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`/api/admin/rewards/${rewardId}/image`, {
    method: "POST",
    body: formData
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "图片上传失败");
  }

  return data;
}

async function fetchWeeklyReview(weekStart: string) {
  const response = await fetch(`/api/review/weekly?weekStart=${weekStart}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "周复盘加载失败");
  }

  return data as WeeklyReviewResponse;
}

function statusText(status: string) {
  if (status === "delivered") return "已兑现";
  if (status === "cancelled") return "已取消";
  return "待兑现";
}

function scheduleTypeText(type: string) {
  if (type === "task") return "学习任务";
  if (type === "free") return "自由时间";
  return "日常安排";
}

export function AdminApp({ initialState, initialWeeklyReview = null, staticMode = false }: Props) {
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState("后台免登录，适合单家庭本地使用。");
  const [busy, setBusy] = useState(false);
  const [weekStart, setWeekStart] = useState(initialState.weeklySummary.weekStart);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReviewView | null>(initialWeeklyReview);
  const [coinBalanceDraft, setCoinBalanceDraft] = useState(String(initialState.child.coinBalance));
  const [coinAdjustReason, setCoinAdjustReason] = useState("家长手动调整");
  const [rewardImageDrafts, setRewardImageDrafts] = useState<
    Record<number, RewardImageDraft | undefined>
  >({});
  const previewUrls = useRef<string[]>([]);
  const template = state.templates[0];
  const pendingRedemptions = useMemo(
    () => state.recent.redemptions.filter((redemption) => redemption.status === "requested"),
    [state.recent.redemptions]
  );

  function applyStaticSnapshot(
    snapshot: ReturnType<typeof commitStaticAdminState>,
    success: string
  ) {
    setState(snapshot.adminState);
    setWeeklyReview(snapshot.weeklyReview);
    setWeekStart(snapshot.weeklyReview.weekStart);
    setMessage(success);
  }

  function commitStaticState(nextState: AdminState, success: string) {
    applyStaticSnapshot(commitStaticAdminState(nextState, weeklyReview), success);
  }

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  useEffect(() => {
    if (!staticMode) return;

    const storedState = loadStaticAdminState();
    if (storedState) {
      setState(storedState.adminState);
      setWeeklyReview(storedState.weeklyReview);
      setWeekStart(storedState.weeklyReview.weekStart);
    }
  }, [staticMode]);

  useEffect(() => {
    if (staticMode) return;

    let cancelled = false;

    fetchWeeklyReview(weekStart)
      .then((review) => {
        if (!cancelled) {
          setWeeklyReview(review);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "周复盘加载失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [staticMode, weekStart]);

  useEffect(() => {
    setCoinBalanceDraft(String(state.child.coinBalance));
  }, [state.child.coinBalance]);

  function updateTask(taskId: number, patch: Partial<TaskItem>) {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    }));
  }

  function updateReward(rewardId: number, patch: Partial<RewardItem>) {
    setState((current) => ({
      ...current,
      rewards: current.rewards.map((reward) =>
        reward.id === rewardId ? { ...reward, ...patch } : reward
      )
    }));
  }

  function updateBlock(blockId: number, patch: Partial<TemplateBlock>) {
    if (!template) return;

    setState((current) => ({
      ...current,
      templates: current.templates.map((item) =>
        item.id === template.id
          ? {
              ...item,
              blocks: item.blocks.map((block) =>
                block.id === blockId ? { ...block, ...patch } : block
              )
            }
          : item
      )
    }));
  }

  function removeScheduleBlock(blockId: number) {
    if (!template) return;

    setState((current) => ({
      ...current,
      templates: current.templates.map((item) =>
        item.id === template.id
          ? {
              ...item,
              blocks:
                blockId < 0
                  ? item.blocks.filter((block) => block.id !== blockId)
                  : item.blocks.map((block) =>
                      block.id === blockId ? { ...block, enabled: false } : block
                    )
            }
          : item
      )
    }));
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function updateRewardImageDraft(rewardId: number, file: File | null) {
    setRewardImageDrafts((current) => {
      const previous = current[rewardId];

      if (previous) {
        URL.revokeObjectURL(previous.previewUrl);
      }

      if (!file) {
        const next = { ...current };
        delete next[rewardId];
        return next;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.push(previewUrl);

      return {
        ...current,
        [rewardId]: {
          file,
          previewUrl
        }
      };
    });
  }

  async function withRefresh(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
      if (staticMode) {
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      setBusy(false);
    }
  }

  function shiftWeek(weeks: number) {
    const [year, month, day] = weekStart.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + weeks * 7));
    const next = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
    setWeekStart(next);
  }

  async function saveWeeklyReviewNotes() {
    if (!weeklyReview) return;

    setBusy(true);
    try {
      if (staticMode) {
        applyStaticSnapshot(commitStaticAdminState(state, weeklyReview), "周复盘已保存在这个浏览器里");
        return;
      }

      await sendJson("/api/admin/weekly-review", "POST", {
        weekStart: weeklyReview.weekStart,
        observation: weeklyReview.review.observation,
        nextFocus: weeklyReview.review.nextFocus
      });
      setWeeklyReview(await fetchWeeklyReview(weeklyReview.weekStart));
      setMessage("周复盘已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "周复盘保存失败");
    } finally {
      setBusy(false);
    }
  }

  function addScheduleBlock() {
    if (!template) return;

    const temporaryId = -Date.now();
    setState((current) => ({
      ...current,
      templates: current.templates.map((item) =>
        item.id === template.id
          ? {
              ...item,
              blocks: [
                ...item.blocks,
                {
                  id: temporaryId,
                  startTime: "18:00",
                  endTime: "18:20",
                  title: "新的安排",
                  description: "填写孩子能看懂的提醒",
                  type: "routine",
                  taskId: null,
                  enabled: true,
                  sortOrder: item.blocks.length + 1
                }
              ]
            }
          : item
      )
    }));
  }

  async function saveScheduleTemplate() {
    if (!template) return;

    if (staticMode) {
      const nextState = {
        ...state,
        templates: state.templates.map((item) =>
          item.id === template.id
            ? {
                ...item,
                blocks: item.blocks.map((block, index) => ({
                  ...block,
                  sortOrder: index + 1
                }))
              }
            : item
        )
      };
      commitStaticState(
        {
          ...nextState,
          schedule: scheduleFromTemplate(nextState)
        },
        "今日日程模板已保存在这个浏览器里"
      );
      return;
    }

    await withRefresh(
      () =>
        sendJson(`/api/admin/schedule-templates/${template.id}`, "PATCH", {
          name: template.name,
          weekdays: template.weekdays,
          enabled: template.enabled,
          blocks: template.blocks.map((block, index) => ({
            ...block,
            id: block.id > 0 ? block.id : null,
            sortOrder: index + 1
          }))
        }),
      "今日日程模板已保存"
    );
  }

  async function addTask(formData: FormData) {
    if (staticMode) {
      const task: TaskItem = {
        id: Math.max(0, ...state.tasks.map((item) => item.id)) + 1,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        points: Number(formData.get("points") ?? 0),
        enabled: true,
        sortOrder: state.tasks.length + 1,
        completedToday: false
      };
      commitStaticState(
        {
          ...state,
          tasks: [...state.tasks, task]
        },
        "任务已新增并保存在这个浏览器里"
      );
      return;
    }

    await withRefresh(
      () =>
        sendJson("/api/admin/tasks", "POST", {
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          points: Number(formData.get("points") ?? 0)
        }),
      "任务已新增"
    );
  }

  async function saveTask(task: TaskItem) {
    if (staticMode) {
      commitStaticState(
        {
          ...state,
          tasks: state.tasks.map((item) => (item.id === task.id ? task : item))
        },
        "任务已保存在这个浏览器里"
      );
      return;
    }

    await withRefresh(
      () =>
        sendJson(`/api/admin/tasks/${task.id}`, "PATCH", {
          title: task.title,
          description: task.description,
          points: task.points,
          enabled: task.enabled
        }),
      "任务已保存"
    );
  }

  async function addReward(formData: FormData) {
    const image = formData.get("image");
    const imageFile = image instanceof File && image.size > 0 ? image : null;

    if (staticMode) {
      const rewardId = Math.max(0, ...state.rewards.map((item) => item.id)) + 1;
      const reward: RewardItem = {
        id: rewardId,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        cost: Number(formData.get("cost") ?? 0),
        tier: String(formData.get("tier") ?? "自定义奖励"),
        category: "custom",
        imageUrl: imageFile ? await fileToDataUrl(imageFile) : null,
        defaultImageUrl: imageAssets.rewards.choice,
        enabled: true,
        sortOrder: state.rewards.length + 1,
        canRedeem: state.child.coinBalance >= Number(formData.get("cost") ?? 0)
      };
      commitStaticState(
        {
          ...state,
          rewards: [...state.rewards, reward]
        },
        "奖励已新增并保存在这个浏览器里"
      );
      return;
    }

    await withRefresh(
      async () => {
        const result = (await sendJson("/api/admin/rewards", "POST", {
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          cost: Number(formData.get("cost") ?? 0),
          tier: String(formData.get("tier") ?? "自定义奖励"),
          category: "custom"
        })) as RewardCreateResponse;

        if (imageFile) {
          await sendRewardImage(result.reward.id, imageFile);
        }
      },
      "奖励已新增"
    );
  }

  async function saveReward(reward: RewardItem) {
    const imageDraft = rewardImageDrafts[reward.id];

    if (staticMode) {
      const imageUrl = imageDraft ? await fileToDataUrl(imageDraft.file) : reward.imageUrl;
      commitStaticState(
        {
          ...state,
          rewards: state.rewards.map((item) =>
            item.id === reward.id ? { ...reward, imageUrl } : item
          )
        },
        "奖励已保存在这个浏览器里"
      );
      setRewardImageDrafts((current) => {
        const next = { ...current };
        delete next[reward.id];
        return next;
      });
      return;
    }

    await withRefresh(
      async () => {
        await sendJson(`/api/admin/rewards/${reward.id}`, "PATCH", {
          title: reward.title,
          description: reward.description,
          cost: reward.cost,
          tier: reward.tier,
          category: reward.category,
          enabled: reward.enabled
        });

        if (imageDraft) {
          await sendRewardImage(reward.id, imageDraft.file);
        }
      },
      "奖励已保存"
    );
  }

  async function addDailyScheduleItem(formData: FormData) {
    if (staticMode) {
      const taskId = Number(formData.get("taskId") ?? 0) || null;
      const task = taskId ? state.tasks.find((item) => item.id === taskId) ?? null : null;
      const id = Date.now();
      const block = {
        id: `override-${id}`,
        sourceId: null,
        startTime: String(formData.get("startTime") ?? ""),
        endTime: String(formData.get("endTime") ?? ""),
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        type: String(formData.get("type") ?? "routine"),
        taskId,
        taskTitle: task?.title ?? null,
        points: task?.points ?? null,
        completedToday: task?.completedToday ?? false,
        sortOrder: 50
      };
      commitStaticState(
        {
          ...state,
          schedule: [...state.schedule, block],
          overrides: [
            {
              id,
              date: state.today,
              action: "add",
              title: block.title,
              startTime: block.startTime,
              endTime: block.endTime
            },
            ...state.overrides
          ].slice(0, 20)
        },
        "今日日程已添加并保存在这个浏览器里"
      );
      return;
    }

    await withRefresh(
      () =>
        sendJson("/api/admin/daily-schedule", "POST", {
          action: "add",
          date: state.today,
          startTime: String(formData.get("startTime") ?? ""),
          endTime: String(formData.get("endTime") ?? ""),
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          type: String(formData.get("type") ?? "routine"),
          taskId: Number(formData.get("taskId") ?? 0) || null,
          sortOrder: 50
        }),
      "今日安排已添加"
    );
  }

  async function updateRedemption(id: number, action: "deliver" | "cancel") {
    if (staticMode) {
      const redemption = state.recent.redemptions.find((item) => item.id === id);
      if (!redemption) return;

      const cancelled = action === "cancel";
      const nextState = {
        ...state,
        child: {
          ...state.child,
          coinBalance:
            cancelled && redemption.status === "requested"
              ? state.child.coinBalance + redemption.cost
              : state.child.coinBalance
        },
        recent: {
          ...state.recent,
          redemptions: state.recent.redemptions.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: cancelled ? "cancelled" : "delivered",
                  deliveredAt: cancelled ? item.deliveredAt : new Date().toISOString(),
                  cancelledAt: cancelled ? new Date().toISOString() : item.cancelledAt
                }
              : item
          ),
          ledger:
            cancelled && redemption.status === "requested"
              ? [
                  {
                    id: Math.max(0, ...state.recent.ledger.map((item) => item.id)) + 1,
                    amount: redemption.cost,
                    reason: `取消兑换 ${redemption.title}`,
                    sourceType: "redemption_cancel",
                    createdAt: new Date().toISOString()
                  },
                  ...state.recent.ledger
                ]
              : state.recent.ledger
        }
      };
      commitStaticState(
        nextState,
        cancelled ? "兑换已取消，星币已退回本地记录" : "奖励已标记为兑现"
      );
      return;
    }

    await withRefresh(
      () => sendJson(`/api/admin/redemptions/${id}/${action}`, "POST", {}),
      action === "deliver" ? "奖励已标记为兑现" : "兑换已取消并退回星币"
    );
  }

  async function adjustCoins(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextBalance = Number(coinBalanceDraft);
    if (!Number.isFinite(nextBalance) || nextBalance < 0) {
      setMessage("星币余额不能小于 0");
      return;
    }

    setBusy(true);
    try {
      if (staticMode) {
        const roundedBalance = Math.round(nextBalance);
        const difference = roundedBalance - state.child.coinBalance;
        const nextState = {
          ...state,
          child: {
            ...state.child,
            coinBalance: roundedBalance
          },
          recent: {
            ...state.recent,
            ledger:
              difference === 0
                ? state.recent.ledger
                : [
                    {
                      id: Math.max(0, ...state.recent.ledger.map((item) => item.id)) + 1,
                      amount: difference,
                      reason: coinAdjustReason,
                      sourceType: "manual_adjust",
                      createdAt: new Date().toISOString()
                    },
                    ...state.recent.ledger
                  ]
          }
        };
        applyStaticSnapshot(
          commitStaticAdminState(nextState, weeklyReview),
          "星币余额已保存在这个浏览器里"
        );
        return;
      }

      const nextState = (await sendJson("/api/admin/coins", "POST", {
        balance: Math.round(nextBalance),
        reason: coinAdjustReason
      })) as AdminState;
      setState(nextState);
      setWeekStart(nextState.weeklySummary.weekStart);
      setCoinBalanceDraft(String(nextState.child.coinBalance));
      setWeeklyReview(await fetchWeeklyReview(nextState.weeklySummary.weekStart));
      setMessage("星币余额已调整，并写入流水。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "星币调整失败");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemoRecords() {
    const confirmed = window.confirm(
      "确定要重置演示记录吗？任务、日程、奖励配置和上传图片会保留，完成记录、兑换记录、星币流水和周复盘备注会清空。"
    );

    if (!confirmed) return;

    setBusy(true);
    try {
      if (staticMode) {
        applyStaticSnapshot(
          resetStaticDemoRecords(state, weeklyReview),
          "演示记录已在这个浏览器里重置"
        );
        return;
      }

      const nextState = (await sendJson("/api/admin/reset-demo-records", "POST", {})) as AdminState;
      setState(nextState);
      setWeekStart(nextState.weeklySummary.weekStart);
      setCoinBalanceDraft(String(nextState.child.coinBalance));
      setWeeklyReview(await fetchWeeklyReview(nextState.weeklySummary.weekStart));
      setMessage("演示记录已重置，规则和奖励配置已保留。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>森林星币站</span>
        </a>
        <nav>
          <a href="/">
            <img alt="" src={imageAssets.icons.parent} />
            孩子端
          </a>
          <a href="#weekly-review">
            <img alt="" src={imageAssets.icons.weekly} />
            周复盘
          </a>
          <a href="#schedule-admin">
            <img alt="" src={imageAssets.icons.schedule} />
            今日日程
          </a>
          <a href="#records">
            <img alt="" src={imageAssets.icons.records} />
            记录
          </a>
        </nav>
      </header>

      <section className="admin-hero">
        <div>
          <p className="eyebrow">家长后台</p>
          <h1>填写规则，查看记录，处理奖励兑现</h1>
          <p>当前是单家庭免登录版本，适合家庭内部使用。孩子端负责简单操作，家长端负责配置和复盘。</p>
        </div>
        <div className="admin-stats">
          <span>
            <strong>{state.child.coinBalance}</strong>
            星币余额
          </span>
          <span>
            <strong>{pendingRedemptions.length}</strong>
            待兑现奖励
          </span>
          <span>
            <strong>{state.tasks.filter((task) => task.enabled).length}</strong>
            启用任务
          </span>
        </div>
      </section>

      <div className="admin-action-bar">
        <div className="admin-message" role="status">
          {busy ? "正在保存..." : message}
        </div>
        <form className="coin-adjust-form" onSubmit={adjustCoins}>
          <label>
            <span>设置星币余额</span>
            <input
              min="0"
              step="1"
              type="number"
              value={coinBalanceDraft}
              onChange={(event) => setCoinBalanceDraft(event.target.value)}
            />
          </label>
          <label>
            <span>调整原因</span>
            <input
              value={coinAdjustReason}
              onChange={(event) => setCoinAdjustReason(event.target.value)}
            />
          </label>
          <button className="admin-button secondary" disabled={busy} type="submit">
            保存星币
          </button>
        </form>
        <button
          className="admin-button danger"
          disabled={busy}
          onClick={resetDemoRecords}
          type="button"
        >
          重置演示记录
        </button>
      </div>

      <section className="admin-single" id="weekly-review">
        <article className="admin-panel weekly-admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">周复盘</p>
              <h2>本周习惯观察</h2>
            </div>
            <div className="week-switcher">
              <button className="admin-button secondary" onClick={() => shiftWeek(-1)} type="button">
                上周
              </button>
              <span>{weeklyReview ? `${weeklyReview.weekStart} - ${weeklyReview.weekEnd}` : "加载中"}</span>
              <button className="admin-button secondary" onClick={() => shiftWeek(1)} type="button">
                下周
              </button>
            </div>
          </div>
          {weeklyReview ? (
            <>
              <div className="weekly-admin-metrics">
                <span>
                  <img alt="" src={imageAssets.icons.calendar} />
                  <strong>{weeklyReview.completedDays}</strong>
                  完成天数
                </span>
                <span>
                  <img alt="" src={imageAssets.icons.learning} />
                  <strong>{weeklyReview.taskCompletions}</strong>
                  完成任务
                </span>
                <span>
                  <img alt="" src={imageAssets.coin} />
                  <strong>{weeklyReview.coinsEarned}</strong>
                  获得星币
                </span>
                <span>
                  <img alt="" src={imageAssets.icons.redemption} />
                  <strong>{weeklyReview.pendingRewards}</strong>
                  待兑现
                </span>
              </div>
              <div className="weekly-admin-layout">
                <div className="weekly-trend">
                  <h3>每日完成趋势</h3>
                  <div className="weekly-bars">
                    {weeklyReview.daily.map((day) => (
                      <div className="weekly-bar-item" key={day.date}>
                        <span>{day.label}</span>
                        <div className="weekly-bar-track">
                          <i style={{ height: `${Math.min(100, day.completionCount * 24 + day.earnedCoins * 3)}%` }} />
                        </div>
                        <strong>{day.completionCount}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="weekly-ranking">
                  <h3>任务完成排行</h3>
                  {weeklyReview.taskRanking.length === 0 ? (
                    <div className="empty-mini">
                      <img alt="" src={imageAssets.emptyRecords} />
                      <span>本周还没有任务记录。</span>
                    </div>
                  ) : (
                    weeklyReview.taskRanking.map((task) => (
                      <div className="rank-row" key={task.taskId}>
                        <strong>{task.title}</strong>
                        <span>{task.count} 次 · +{task.points} 星币</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="weekly-notes">
                  <h3>家长复盘</h3>
                  <label>
                    <span>本周观察</span>
                    <textarea
                      value={weeklyReview.review.observation}
                      onChange={(event) =>
                        setWeeklyReview({
                          ...weeklyReview,
                          review: {
                            ...weeklyReview.review,
                            observation: event.target.value
                          }
                        })
                      }
                      placeholder="例如：开始作业更主动，但订正错题还需要陪伴。"
                    />
                  </label>
                  <label>
                    <span>下周重点</span>
                    <textarea
                      value={weeklyReview.review.nextFocus}
                      onChange={(event) =>
                        setWeeklyReview({
                          ...weeklyReview,
                          review: {
                            ...weeklyReview.review,
                            nextFocus: event.target.value
                          }
                        })
                      }
                      placeholder="例如：先把订正错题拆成 10 分钟小任务。"
                    />
                  </label>
                  <button className="admin-button" disabled={busy} onClick={saveWeeklyReviewNotes} type="button">
                    保存周复盘
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-mini">
              <img alt="" src={imageAssets.emptyWeekly} />
              <span>正在整理本周记录...</span>
            </div>
          )}
        </article>
      </section>

      <section className="admin-single" id="schedule-admin">
        <article className="admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">今日日程</p>
              <h2>今日安排与常用模板</h2>
            </div>
            <button className="admin-button secondary" onClick={addScheduleBlock} type="button">
              新增模板时间块
            </button>
          </div>

          <div className="today-schedule-preview" aria-label="今日实际日程预览">
            {state.schedule.map((block) => (
              <div className={`preview-note preview-${block.type}`} key={block.id}>
                <span>
                  {block.startTime}-{block.endTime}
                </span>
                <strong>{block.title}</strong>
                <small>{scheduleTypeText(block.type)}</small>
              </div>
            ))}
          </div>

          <div className="schedule-admin-layout">
            <div className="template-editor">
              <div className="sub-panel-title">
                <h3>常用模板</h3>
                <p>这里是每天默认会出现的安排。</p>
              </div>
              {template ? (
                <>
                  <label className="field-line">
                    <span>模板名称</span>
                    <input
                      value={template.name}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          templates: current.templates.map((item) =>
                            item.id === template.id ? { ...item, name: event.target.value } : item
                          )
                        }))
                      }
                    />
                  </label>
                  <div className="schedule-editor">
                    {template.blocks.map((block) => (
                      <div className={block.enabled ? "editor-row" : "editor-row is-disabled"} key={block.id}>
                        <input
                          aria-label="开始时间"
                          type="time"
                          value={block.startTime}
                          onChange={(event) => updateBlock(block.id, { startTime: event.target.value })}
                        />
                        <input
                          aria-label="结束时间"
                          type="time"
                          value={block.endTime}
                          onChange={(event) => updateBlock(block.id, { endTime: event.target.value })}
                        />
                        <input
                          aria-label="标题"
                          value={block.title}
                          onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                        />
                        <select
                          aria-label="类型"
                          value={block.type}
                          onChange={(event) => updateBlock(block.id, { type: event.target.value })}
                        >
                          <option value="routine">日常安排</option>
                          <option value="task">学习任务</option>
                          <option value="free">自由时间</option>
                        </select>
                        <select
                          aria-label="关联任务"
                          value={block.taskId ?? ""}
                          onChange={(event) =>
                            updateBlock(block.id, {
                              taskId: event.target.value ? Number(event.target.value) : null
                            })
                          }
                        >
                          <option value="">不关联任务</option>
                          {state.tasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title}
                            </option>
                          ))}
                        </select>
                        <label className="switch-line">
                          <input
                            checked={block.enabled}
                            type="checkbox"
                            onChange={(event) =>
                              updateBlock(block.id, { enabled: event.target.checked })
                            }
                          />
                          启用
                        </label>
                        <button
                          className="admin-button danger"
                          disabled={busy || !block.enabled}
                          onClick={() => removeScheduleBlock(block.id)}
                          type="button"
                        >
                          {block.enabled ? "删除" : "已删除"}
                        </button>
                        <textarea
                          aria-label="说明"
                          value={block.description}
                          onChange={(event) =>
                            updateBlock(block.id, { description: event.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    className="admin-button"
                    disabled={busy}
                    onClick={saveScheduleTemplate}
                    type="button"
                  >
                    保存常用模板
                  </button>
                </>
              ) : (
                <p>还没有日程模板。</p>
              )}
            </div>

            <div className="today-add-panel">
              <div className="sub-panel-title">
                <h3>添加今日安排</h3>
                <p>只影响今天，会和常用模板一起显示在孩子端。</p>
              </div>
              <form action={addDailyScheduleItem} className="stack-form">
                <label>
                  <span>标题</span>
                  <input name="title" placeholder="例如 英语朗读" required />
                </label>
                <label>
                  <span>说明</span>
                  <input name="description" placeholder="例如 读 10 分钟课文" required />
                </label>
                <div className="two-cols">
                  <label>
                    <span>开始</span>
                    <input name="startTime" type="time" defaultValue="18:20" required />
                  </label>
                  <label>
                    <span>结束</span>
                    <input name="endTime" type="time" defaultValue="18:35" required />
                  </label>
                </div>
                <label>
                  <span>类型</span>
                  <select name="type" defaultValue="task">
                    <option value="routine">日常安排</option>
                    <option value="task">学习任务</option>
                    <option value="free">自由时间</option>
                  </select>
                </label>
                <label>
                  <span>关联任务</span>
                  <select name="taskId" defaultValue="">
                    <option value="">不关联任务</option>
                    {state.tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="admin-button" disabled={busy} type="submit">
                  添加到今日日程
                </button>
              </form>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-grid">
        <article className="admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">任务管理</p>
              <h2>星币规则</h2>
            </div>
          </div>
          <form action={addTask} className="inline-add">
            <input name="title" placeholder="任务名称" required />
            <input name="description" placeholder="孩子能看懂的说明" required />
            <input min="0" name="points" placeholder="星币" required type="number" />
            <button className="admin-button" disabled={busy} type="submit">
              新增
            </button>
          </form>
          <div className="editable-list">
            {state.tasks.map((task) => (
              <div className="editable-item" key={task.id}>
                <input
                  value={task.title}
                  onChange={(event) => updateTask(task.id, { title: event.target.value })}
                />
                <input
                  value={task.description}
                  onChange={(event) => updateTask(task.id, { description: event.target.value })}
                />
                <input
                  min="0"
                  type="number"
                  value={task.points}
                  onChange={(event) => updateTask(task.id, { points: Number(event.target.value) })}
                />
                <label className="switch-line">
                  <input
                    checked={task.enabled}
                    type="checkbox"
                    onChange={(event) => updateTask(task.id, { enabled: event.target.checked })}
                  />
                  启用
                </label>
                <button
                  className="admin-button secondary"
                  disabled={busy}
                  onClick={() => saveTask(task)}
                  type="button"
                >
                  保存
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">奖励管理</p>
              <h2>兑换清单</h2>
            </div>
          </div>
          <form action={addReward} className="reward-create-card">
            <label>
              <span>奖励名称</span>
              <input name="title" placeholder="例如 周末自然探索" required />
            </label>
            <label>
              <span>奖励说明</span>
              <input name="description" placeholder="孩子能看懂的兑换说明" required />
            </label>
            <label>
              <span>星币</span>
              <input min="0" name="cost" required type="number" />
            </label>
            <label>
              <span>分类</span>
              <input name="tier" placeholder="例如 亲子陪伴" />
            </label>
            <label className="image-upload-field">
              <span>奖励图片</span>
              <input accept="image/png,image/jpeg,image/webp" name="image" type="file" />
              <small>PNG / JPG / WebP，2MB 以内</small>
            </label>
            <button className="admin-button" disabled={busy} type="submit">
              新增奖励
            </button>
          </form>
          <div className="reward-admin-grid">
            {state.rewards.map((reward) => (
              <div className="reward-admin-card" key={reward.id}>
                <div className="reward-image-preview">
                  <img
                    alt=""
                    src={
                      rewardImageDrafts[reward.id]?.previewUrl ??
                      reward.imageUrl ??
                      reward.defaultImageUrl
                    }
                  />
                </div>
                <label>
                  <span>名称</span>
                  <input
                    value={reward.title}
                    onChange={(event) => updateReward(reward.id, { title: event.target.value })}
                  />
                </label>
                <label>
                  <span>说明</span>
                  <textarea
                    value={reward.description}
                    onChange={(event) =>
                      updateReward(reward.id, { description: event.target.value })
                    }
                  />
                </label>
                <div className="reward-admin-row">
                  <label>
                    <span>星币</span>
                    <input
                      min="0"
                      type="number"
                      value={reward.cost}
                      onChange={(event) =>
                        updateReward(reward.id, { cost: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>分类</span>
                    <input
                      value={reward.tier}
                      onChange={(event) => updateReward(reward.id, { tier: event.target.value })}
                    />
                  </label>
                </div>
                <div className="reward-admin-row">
                  <label className="image-upload-field">
                    <span>奖励图片</span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      type="file"
                      onChange={(event) =>
                        updateRewardImageDraft(reward.id, event.target.files?.[0] ?? null)
                      }
                    />
                    <small>
                      {rewardImageDrafts[reward.id]
                        ? rewardImageDrafts[reward.id]?.file.name
                        : "选择后点击保存奖励"}
                    </small>
                  </label>
                  <label className="switch-line reward-switch">
                    <input
                      checked={reward.enabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateReward(reward.id, { enabled: event.target.checked })
                      }
                    />
                    启用
                  </label>
                </div>
                <button
                  className="admin-button secondary"
                  disabled={busy}
                  onClick={() => saveReward(reward)}
                  type="button"
                >
                  保存奖励
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-grid" id="records">
        <article className="admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">兑换处理</p>
              <h2>待兑现奖励</h2>
            </div>
          </div>
          <div className="record-table">
            {state.recent.redemptions.length === 0 ? <p>还没有兑换记录。</p> : null}
            {state.recent.redemptions.map((redemption) => (
              <div className="record-row" key={redemption.id}>
                <div>
                  <strong>{redemption.title}</strong>
                  <span>
                    {redemption.cost} 星币 · {statusText(redemption.status)} ·{" "}
                    {formatDateTime(redemption.requestedAt)}
                  </span>
                </div>
                {redemption.status === "requested" ? (
                  <div className="row-actions">
                    <button
                      className="admin-button"
                      disabled={busy}
                      onClick={() => updateRedemption(redemption.id, "deliver")}
                      type="button"
                    >
                      已兑现
                    </button>
                    <button
                      className="admin-button secondary"
                      disabled={busy}
                      onClick={() => updateRedemption(redemption.id, "cancel")}
                      type="button"
                    >
                      取消退币
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="admin-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">记录中心</p>
              <h2>星币流水</h2>
            </div>
          </div>
          <div className="record-table">
            {state.recent.ledger.map((item) => (
              <div className="record-row compact" key={item.id}>
                <strong className={item.amount > 0 ? "positive" : "negative"}>
                  {item.amount > 0 ? "+" : ""}
                  {item.amount}
                </strong>
                <span>
                  {item.reason} · {formatDateTime(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
