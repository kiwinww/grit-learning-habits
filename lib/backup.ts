import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { backupChecksum } from "@/lib/security";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const BACKUP_SCHEMA = "family-star-coin-backup/v2";
export const LEGACY_BACKUP_SCHEMA = "family-star-coin-backup/v1";

export async function createBackup() {
  const [family, children, tasks, schedules, completions, transactions, rewards, redemptions, reviews] = await Promise.all([
    prisma.familySetting.findMany(),
    prisma.child.findMany(),
    prisma.task.findMany(),
    prisma.schedule.findMany(),
    prisma.completion.findMany(),
    prisma.coinTransaction.findMany(),
    prisma.reward.findMany(),
    prisma.redemption.findMany(),
    prisma.weeklyReview.findMany()
  ]);
  const data = {
    family: family.map(({ parentPinHash: _hash, parentPinSalt: _salt, ...item }) => item),
    children,
    tasks,
    schedules,
    completions,
    transactions,
    rewards: rewards.map((reward) => ({
      ...reward,
      imageData: reward.imageData ? Buffer.from(reward.imageData).toString("base64") : null
    })),
    redemptions,
    reviews
  };
  return {
    schemaVersion: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    data,
    checksum: backupChecksum(data)
  };
}

type BackupInput = Awaited<ReturnType<typeof createBackup>>;

export async function saveServerBackup(prefix: string) {
  const backup = await createBackup();
  const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  await mkdir(backupDir, { recursive: true });
  const backupName = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(backupDir, backupName), JSON.stringify(backup, null, 2), { encoding: "utf8", flag: "wx" });
  return backupName;
}

export async function restoreBackup(input: unknown) {
  if (!input || typeof input !== "object") throw new AppError("INVALID_BACKUP", "备份文件格式不正确。", 400);
  const backup = input as BackupInput & { schemaVersion: string };
  if (![BACKUP_SCHEMA, LEGACY_BACKUP_SCHEMA].includes(backup.schemaVersion) || !backup.data || backup.checksum !== backupChecksum(backup.data)) {
    throw new AppError("INVALID_BACKUP", "备份版本或校验摘要不正确。", 400);
  }
  const current = await createBackup();
  const family = await prisma.familySetting.findUnique({ where: { id: 1 } });
  if (!family) throw new AppError("NOT_INITIALIZED", "当前家庭尚未初始化。", 409);
  const backupDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  await mkdir(backupDir, { recursive: true });
  const backupName = `pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(backupDir, backupName), JSON.stringify(current, null, 2), { encoding: "utf8", flag: "wx" });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.parentSession.deleteMany();
      await tx.coinTransaction.deleteMany();
      await tx.redemption.deleteMany();
      await tx.completion.deleteMany();
      await tx.weeklyReview.deleteMany();
      await tx.schedule.deleteMany();
      await tx.reward.deleteMany();
      await tx.task.deleteMany();
      await tx.child.deleteMany();

      await tx.child.createMany({ data: backup.data.children.map(({ createdAt, updatedAt, ...item }) => ({ ...item, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })) });
      await tx.task.createMany({ data: backup.data.tasks.map(({ createdAt, updatedAt, ...item }) => ({ ...item, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })) });
      await tx.reward.createMany({ data: backup.data.rewards.map(({ createdAt, updatedAt, imageData, ...item }) => ({ ...item, imageData: imageData ? Buffer.from(imageData, "base64") : null, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })) });
      await tx.schedule.createMany({ data: backup.data.schedules.map(({ createdAt, updatedAt, ...item }) => ({ ...item, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })) });
      await tx.completion.createMany({ data: backup.data.completions.map(({ completedAt, approvedAt, revokedAt, ...item }) => ({ ...item, completedAt: new Date(completedAt), approvedAt: approvedAt ? new Date(approvedAt) : null, revokedAt: revokedAt ? new Date(revokedAt) : null })) });
      await tx.coinTransaction.createMany({ data: backup.data.transactions.map(({ createdAt, ...item }) => ({ ...item, createdAt: new Date(createdAt) })) });
      const refundLinks = backup.data.redemptions
        .filter((item) => item.refundTransactionId)
        .map((item) => ({ id: item.id, refundTransactionId: item.refundTransactionId! }));
      await tx.redemption.createMany({ data: backup.data.redemptions.map(({ requestedAt, fulfilledAt, cancelledAt, refundTransactionId: _refund, ...item }) => ({ ...item, refundTransactionId: null, requestedAt: new Date(requestedAt), fulfilledAt: fulfilledAt ? new Date(fulfilledAt) : null, cancelledAt: cancelledAt ? new Date(cancelledAt) : null })) });
      await tx.weeklyReview.createMany({ data: backup.data.reviews.map(({ createdAt, updatedAt, ...item }) => ({ ...item, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })) });

      for (const link of refundLinks) {
        await tx.redemption.update({ where: { id: link.id }, data: { refundTransactionId: link.refundTransactionId } });
      }

      const importedFamily = backup.data.family[0];
      if (importedFamily) {
        const { id: _id, createdAt: _created, updatedAt: _updated, ...settings } = importedFamily;
        await tx.familySetting.update({ where: { id: 1 }, data: settings });
      }
    });
  } catch (error) {
    console.error("Import failed; pre-import backup saved as:", backupName);
    throw error;
  }
}
