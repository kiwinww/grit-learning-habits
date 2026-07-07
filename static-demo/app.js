const tasks = [
  {
    id: "start",
    time: "17:00 - 17:10",
    title: "按时开始作业",
    description: "回家休息后，自己坐到书桌前准备。",
    type: "task",
    points: 3,
    icon: "assets/gpt-image/icons/icon-task-learning.png"
  },
  {
    id: "think",
    time: "17:10 - 17:35",
    title: "独立思考难题",
    description: "遇到不会的题，先试三分钟再求助。",
    type: "task",
    points: 5,
    icon: "assets/gpt-image/badges/badge-thinking.png"
  },
  {
    id: "break",
    time: "17:35 - 17:50",
    title: "喝水和活动",
    description: "伸展一下，让眼睛和身体都休息。",
    type: "routine",
    points: 0,
    icon: "assets/gpt-image/icons/icon-type-routine.png"
  },
  {
    id: "free",
    time: "19:30 - 20:00",
    title: "自由时间",
    description: "完成学习后，快乐就是入场券。",
    type: "free",
    points: 0,
    icon: "assets/gpt-image/icons/icon-type-free.png"
  }
];

const rewards = [
  {
    id: "screen",
    title: "动画时间",
    description: "多看 10 分钟喜欢的动画。",
    cost: 8,
    image: "assets/gpt-image/rewards/reward-screen.png"
  },
  {
    id: "food",
    title: "点菜权",
    description: "晚餐选一道全家都能吃的菜。",
    cost: 12,
    image: "assets/gpt-image/rewards/reward-food.png"
  },
  {
    id: "book",
    title: "绘本故事",
    description: "睡前多讲一本喜欢的绘本。",
    cost: 18,
    image: "assets/gpt-image/rewards/reward-book.png"
  },
  {
    id: "outing",
    title: "亲子出游",
    description: "周末安排一次小小出游。",
    cost: 60,
    image: "assets/gpt-image/rewards/reward-outing.png"
  }
];

const state = {
  coins: 0,
  completed: new Set(),
  redemptions: [],
  ledger: [{ amount: 0, reason: "初始星币" }]
};

const $ = (selector) => document.querySelector(selector);

function setNotice(text, type = "soft") {
  const notice = $("#notice");
  notice.textContent = text;
  notice.style.background = type === "good" ? "#1f6f31" : type === "warn" ? "#fff0cf" : "#fff";
  notice.style.color = type === "good" ? "#fff" : type === "warn" ? "#76530e" : "#14612c";
}

function addLedger(amount, reason) {
  state.ledger.unshift({ amount, reason });
}

function renderSchedule() {
  $("#scheduleGrid").innerHTML = tasks
    .map((task) => {
      const done = state.completed.has(task.id);
      const button =
        task.type === "task"
          ? `<button class="button ${done ? "secondary" : ""}" data-task="${task.id}" type="button">${done ? "取消完成" : `完成得 ${task.points} 星币`}</button>`
          : `<span class="pill">${task.type === "free" ? "自由时间" : "日常安排"}</span>`;
      return `
        <article class="sticky-note ${task.type} ${done ? "done" : ""}">
          <div class="note-top">
            <img alt="" src="${task.icon}" />
            <span class="time">${task.time}</span>
          </div>
          <h3>${task.title}</h3>
          <p>${task.description}</p>
          ${button}
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => toggleTask(button.dataset.task));
  });
}

function renderRewards() {
  $("#rewardGrid").innerHTML = rewards
    .map((reward) => {
      const canRedeem = state.coins >= reward.cost;
      return `
        <article class="reward-card">
          <img alt="" src="${reward.image}" />
          <div class="reward-body">
            <h3>${reward.title}</h3>
            <p>${reward.description}</p>
            <strong class="reward-cost">${reward.cost} 星币</strong>
            <button class="button ${canRedeem ? "" : "secondary"}" data-reward="${reward.id}" type="button">
              ${canRedeem ? "兑换奖励" : "继续攒星币"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-reward]").forEach((button) => {
    button.addEventListener("click", () => redeemReward(button.dataset.reward));
  });
}

function renderRecords() {
  $("#ledgerList").innerHTML = state.ledger
    .slice(0, 6)
    .map(
      (item) => `
        <div class="record">
          <strong class="${item.amount >= 0 ? "positive" : "negative"}">${item.amount > 0 ? "+" : ""}${item.amount}</strong>
          <span>${item.reason}</span>
        </div>
      `
    )
    .join("");

  $("#redemptionList").innerHTML =
    state.redemptions.length === 0
      ? `<div class="record"><span>暂无待兑现奖励</span></div>`
      : state.redemptions
          .map(
            (item) => `
              <div class="record">
                <strong>${item.title}</strong>
                <span>${item.cost} 星币 · 待兑现</span>
              </div>
            `
          )
          .join("");
}

function renderSummary() {
  const target = rewards.find((reward) => state.coins < reward.cost) ?? rewards[0];
  const progress = Math.min(Math.round((state.coins / target.cost) * 100), 100);
  $("#coinBalance").textContent = state.coins;
  $("#shopCoins").textContent = state.coins;
  $("#coinInput").value = state.coins;
  $("#targetTitle").textContent = target.title;
  $("#targetProgress").style.width = `${progress}%`;
  $("#targetHint").textContent =
    state.coins >= target.cost ? "已经可以兑换啦" : `还差 ${target.cost - state.coins} 枚星币`;
  $("#weeklySummary").textContent = `完成 ${state.completed.size} 个学习任务`;
  $("#coinBadge").classList.toggle("active", state.coins >= 15);
  $("#rewardBadge").classList.toggle("active", state.redemptions.length > 0);
}

function render() {
  renderSummary();
  renderSchedule();
  renderRewards();
  renderRecords();
}

function toggleTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  if (state.completed.has(taskId)) {
    if (state.coins < task.points) {
      setNotice("星币余额不足，先处理已兑换奖励后再取消。", "warn");
      return;
    }
    state.completed.delete(taskId);
    state.coins -= task.points;
    addLedger(-task.points, `取消「${task.title}」`);
    setNotice(`已取消「${task.title}」，星币已扣回。`);
  } else {
    state.completed.add(taskId);
    state.coins += task.points;
    addLedger(task.points, `完成「${task.title}」`);
    setNotice(`完成「${task.title}」，星币到账。`, "good");
  }
  render();
}

function redeemReward(rewardId) {
  const reward = rewards.find((item) => item.id === rewardId);
  if (!reward) return;

  if (state.coins < reward.cost) {
    setNotice(`还差 ${reward.cost - state.coins} 个星币，再完成一个任务就更近啦。`, "warn");
    return;
  }

  state.coins -= reward.cost;
  state.redemptions.unshift({ title: reward.title, cost: reward.cost });
  addLedger(-reward.cost, `兑换「${reward.title}」`);
  setNotice(`兑换「${reward.title}」成功，家长后台已生成待兑现记录。`, "good");
  render();
}

$("#saveCoins").addEventListener("click", () => {
  const next = Math.max(0, Math.round(Number($("#coinInput").value) || 0));
  const difference = next - state.coins;
  state.coins = next;
  if (difference !== 0) {
    addLedger(difference, $("#reasonInput").value.trim() || "家长手动调整");
  }
  setNotice("星币余额已调整，并写入流水。", "good");
  render();
});

$("#resetButton").addEventListener("click", () => {
  state.coins = 0;
  state.completed.clear();
  state.redemptions = [];
  state.ledger = [{ amount: 0, reason: "初始星币" }];
  setNotice("演示记录已重置，规则和奖励配置已保留。");
  render();
});

render();
