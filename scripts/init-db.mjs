import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const binExt = process.platform === "win32" ? ".cmd" : "";
const prismaBin = join(root, "node_modules", ".bin", `prisma${binExt}`);
const tsxBin = join(root, "node_modules", ".bin", `tsx${binExt}`);
const dbPath = join(root, "prisma", "dev.db");

function run(command, args, options = {}) {
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? process.env.ComSpec ?? "cmd.exe" : command, [
    ...(isWindows ? ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")] : args)
  ], {
    cwd: root,
    encoding: "utf8",
    ...options
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result;
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=\\-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

const needsSchema = !existsSync(dbPath) || statSync(dbPath).size === 0;

run(prismaBin, ["generate"], { stdio: "inherit" });

if (needsSchema) {
  const diff = run(prismaBin, [
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script"
  ]);

  run(prismaBin, ["db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], {
    input: diff.stdout,
    stdio: ["pipe", "inherit", "inherit"]
  });
} else {
  console.log("SQLite schema already exists; skipping schema initialization.");
}

run(tsxBin, ["prisma/seed.ts"], { stdio: "inherit" });
