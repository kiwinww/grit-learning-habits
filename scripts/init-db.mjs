import "dotenv/config";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./family-star-coin.db";
if (databaseUrl.startsWith("file:./")) {
  const databasePath = resolve(process.cwd(), "prisma", databaseUrl.slice("file:./".length));
  if (!existsSync(databasePath)) closeSync(openSync(databasePath, "w"));
}

for (const args of [["prisma", "generate"], ["prisma", "db", "push"]]) {
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npx.cmd ${args.join(" ")}`], { stdio: "inherit", env: process.env })
    : spawnSync("npx", args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (process.env.DEMO_SEED === "1") {
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npx.cmd tsx prisma/seed.ts"], { stdio: "inherit", env: process.env })
    : spawnSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
