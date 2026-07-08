import "dotenv/config";

import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminApp } from "@/app/admin/admin-app";
import { ChildApp } from "@/app/child-app";
import { getAdminState, getAppState } from "@/lib/app-state";
import { getWeeklyReviewState } from "@/lib/weekly-review";

const root = process.cwd();
const destination = join(root, "pages-dist");
const basePath = normalizeBasePath(process.env.PAGES_BASE_PATH ?? "/grit-learning-habits");

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function withBasePath(path: string) {
  return `${basePath}${path}`;
}

function rewriteRootPaths(markup: string) {
  return markup
    .replaceAll('href="/', `href="${withBasePath("/")}`)
    .replaceAll('src="/', `src="${withBasePath("/")}`);
}

function rewriteCssPaths(css: string) {
  return css
    .replaceAll('url("/assets/', `url("${withBasePath("/assets/")}`)
    .replaceAll("url('/assets/", `url('${withBasePath("/assets/")}`)
    .replaceAll("url(/assets/", `url(${withBasePath("/assets/")}`);
}

function renderDocument(title: string, appMarkup: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${withBasePath("/styles.css")}" />
  </head>
  <body>
    ${rewriteRootPaths(appMarkup)}
  </body>
</html>
`;
}

async function copyIfExists(source: string, target: string) {
  try {
    await access(source);
  } catch {
    return;
  }

  await cp(source, target, { recursive: true });
}

await rm(destination, { force: true, recursive: true });
await mkdir(join(destination, "admin"), { recursive: true });
await cp(join(root, "public", "assets"), join(destination, "assets"), { recursive: true });
await copyIfExists(join(root, "public", "uploads"), join(destination, "uploads"));

const [appState, adminState, weeklyReview, css] = await Promise.all([
  getAppState(),
  getAdminState(),
  getWeeklyReviewState(),
  readFile(join(root, "app", "globals.css"), "utf8")
]);

const homeMarkup = renderToStaticMarkup(<ChildApp initialState={appState} />);
const adminMarkup = renderToStaticMarkup(
  <AdminApp initialState={adminState} initialWeeklyReview={weeklyReview} />
);

await writeFile(join(destination, "styles.css"), rewriteCssPaths(css));
await writeFile(join(destination, "index.html"), renderDocument("森林星币站", homeMarkup));
await writeFile(
  join(destination, "admin", "index.html"),
  renderDocument("家长后台 - 森林星币站", adminMarkup)
);
await writeFile(join(destination, ".nojekyll"), "");

console.log(`Static Pages bundle written to pages-dist with base path ${basePath || "/"}`);
