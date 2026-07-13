"use client";

type NoticeInput = string | { message: React.ReactNode; description?: React.ReactNode; duration?: number };
type NoticeType = "success" | "info" | "warning" | "error";

function send(type: NoticeType, input: NoticeInput) {
  if (typeof window === "undefined") return;
  const value = typeof input === "string" ? { message: input } : input;
  window.dispatchEvent(new CustomEvent("family-notice", { detail: { type, ...value } }));
}

export const Notification = {
  success: (input: NoticeInput) => send("success", input),
  info: (input: NoticeInput) => send("info", input),
  warning: (input: NoticeInput) => send("warning", input),
  error: (input: NoticeInput) => send("error", input)
};
