import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tasks = [
  {
    slug: "start-on-time",
    title: "准时开始",
    description: "到点独立坐到书桌前",
    points: 3,
    sortOrder: 1
  },
  {
    slug: "math-two-pages",
    title: "数学两页",
    description: "完成后自己检查一遍",
    points: 5,
    sortOrder: 2
  },
  {
    slug: "think-first",
    title: "难题思考",
    description: "先思考 3 分钟再求助",
    points: 5,
    sortOrder: 3
  },
  {
    slug: "fix-mistakes",
    title: "订正错题",
    description: "说清楚错在哪里",
    points: 3,
    sortOrder: 4
  },
  {
    slug: "pack-bag",
    title: "整理书包",
    description: "把明天用品放好",
    points: 2,
    sortOrder: 5
  }
];

const rewards = [
  {
    slug: "cartoon-ten-minutes",
    title: "多看 10 分钟动画",
    description: "完成基础任务后，开心放松一下。",
    cost: 8,
    tier: "即时小满足",
    category: "screen",
    sortOrder: 1
  },
  {
    slug: "dinner-choice",
    title: "今晚点菜权",
    description: "晚饭选一道自己喜欢的菜。",
    cost: 12,
    tier: "家庭选择权",
    category: "food",
    sortOrder: 2
  },
  {
    slug: "bedtime-story",
    title: "睡前多讲一个故事",
    description: "把今天的努力换成亲子时间。",
    cost: 18,
    tier: "亲子陪伴",
    category: "book",
    sortOrder: 3
  },
  {
    slug: "weekend-nature-trip",
    title: "周末自然探索",
    description: "攒够星币，去公园完成一次小探险。",
    cost: 60,
    tier: "延迟大满足",
    category: "outing",
    sortOrder: 4
  }
];

async function main() {
  let child = await prisma.child.findUnique({ where: { slug: "default-child" } });

  if (!child) {
    child = await prisma.child.create({
      data: {
        slug: "default-child",
        name: "小树",
        avatar: "leaf",
        coinBalance: 0
      }
    });
  } else {
    child = await prisma.child.update({
      where: { id: child.id },
      data: {
        name: "小树",
        avatar: "leaf"
      }
    });
  }

  const ledgerCount = await prisma.coinLedger.count({ where: { childId: child.id } });
  if (ledgerCount === 0) {
    await prisma.coinLedger.create({
      data: {
        childId: child.id,
        amount: 0,
        reason: "初始星币",
        sourceType: "seed"
      }
    });
    await prisma.child.update({
      where: { id: child.id },
      data: { coinBalance: 0 }
    });
  }

  const taskRecords = [];
  for (const task of tasks) {
    taskRecords.push(
      await prisma.taskTemplate.upsert({
        where: { slug: task.slug },
        update: {
          title: task.title,
          description: task.description,
          points: task.points,
          sortOrder: task.sortOrder,
          enabled: true
        },
        create: {
          ...task,
          enabled: true
        }
      })
    );
  }

  for (const reward of rewards) {
    await prisma.reward.upsert({
      where: { slug: reward.slug },
      update: {
        title: reward.title,
        description: reward.description,
        cost: reward.cost,
        tier: reward.tier,
        category: reward.category,
        sortOrder: reward.sortOrder,
        enabled: true
      },
      create: {
        ...reward,
        enabled: true
      }
    });
  }

  const template = await prisma.scheduleTemplate.upsert({
    where: { slug: "after-school-default" },
    update: {
      name: "放学后每日作息",
      weekdays: "0,1,2,3,4,5,6",
      enabled: true
    },
    create: {
      slug: "after-school-default",
      name: "放学后每日作息",
      weekdays: "0,1,2,3,4,5,6",
      enabled: true
    }
  });

  const taskBySlug = Object.fromEntries(taskRecords.map((task) => [task.slug, task]));
  const blocks = [
    {
      slug: "arrive-home",
      startTime: "16:30",
      endTime: "16:45",
      title: "回家整理",
      description: "放好书包，喝水休息一下",
      type: "routine",
      sortOrder: 1
    },
    {
      slug: "start-homework",
      startTime: "16:45",
      endTime: "17:00",
      title: "准时开始",
      description: "坐到书桌前，打开今日任务",
      type: "task",
      taskId: taskBySlug["start-on-time"].id,
      sortOrder: 2
    },
    {
      slug: "study-block",
      startTime: "17:00",
      endTime: "17:35",
      title: "学习闯关",
      description: "完成数学两页，遇到难题先想一想",
      type: "task",
      taskId: taskBySlug["math-two-pages"].id,
      sortOrder: 3
    },
    {
      slug: "free-time",
      startTime: "17:35",
      endTime: "18:00",
      title: "自由时间",
      description: "完成学习后，自己安排快乐时间",
      type: "free",
      sortOrder: 4
    },
    {
      slug: "pack-before-bed",
      startTime: "20:30",
      endTime: "20:45",
      title: "睡前整理",
      description: "整理书包，准备明天用品",
      type: "task",
      taskId: taskBySlug["pack-bag"].id,
      sortOrder: 5
    }
  ];

  for (const block of blocks) {
    await prisma.scheduleBlock.upsert({
      where: { slug: block.slug },
      update: {
        templateId: template.id,
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        description: block.description,
        type: block.type,
        taskId: block.taskId ?? null,
        sortOrder: block.sortOrder,
        enabled: true
      },
      create: {
        ...block,
        templateId: template.id,
        taskId: block.taskId ?? null,
        enabled: true
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
