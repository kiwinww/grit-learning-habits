import "dotenv/config";

import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import React from "react";
import { renderToString } from "react-dom/server";
import { AdminApp } from "@/app/admin/admin-app";
import { ChildApp } from "@/app/child-app";
import { getAdminState, getAppState } from "@/lib/app-state";
import type { StaticPagesSnapshot } from "@/lib/static-pages-state";
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

function scriptJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function renderDocument(title: string, appMarkup: string, snapshot: StaticPagesSnapshot) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="${withBasePath("/styles.css")}" />
  </head>
  <body>
    <div id="__grit-root">${rewriteRootPaths(appMarkup)}</div>
    <script>window.__GRIT_PAGES_DATA__=${scriptJson(snapshot)};</script>
    <script type="module" src="${withBasePath("/pages-client.js")}"></script>
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

await build({
  entryPoints: [join(root, "scripts", "pages-client.tsx")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: join(destination, "pages-client.js"),
  platform: "browser",
  sourcemap: false,
  tsconfig: join(root, "tsconfig.json")
});

const baseSnapshot = {
  appState,
  adminState,
  weeklyReview
};
const homeMarkup = renderToString(<ChildApp initialState={appState} staticMode />);
const adminMarkup = renderToString(
  <AdminApp initialState={adminState} initialWeeklyReview={weeklyReview} staticMode />
);

await writeFile(join(destination, "styles.css"), rewriteCssPaths(css));
await writeFile(
  join(destination, "index.html"),
  renderDocument("森林星币站", homeMarkup, {
    ...baseSnapshot,
    page: "home"
  })
);
await writeFile(
  join(destination, "admin", "index.html"),
  renderDocument("家长后台 - 森林星币站", adminMarkup, {
    ...baseSnapshot,
    page: "admin"
  })
);
await writeFile(join(destination, ".nojekyll"), "");

console.log(`Static Pages bundle written to pages-dist with base path ${basePath || "/"}`);
