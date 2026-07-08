import React from "react";
import { hydrateRoot } from "react-dom/client";
import { AdminApp } from "@/app/admin/admin-app";
import { ChildApp } from "@/app/child-app";

const root = document.getElementById("__grit-root");
const data = window.__GRIT_PAGES_DATA__;

if (root && data) {
  hydrateRoot(
    root,
    data.page === "admin" ? (
      <AdminApp
        initialState={data.adminState}
        initialWeeklyReview={data.weeklyReview}
        staticMode
      />
    ) : (
      <ChildApp initialState={data.appState} staticMode />
    )
  );
}
