"use client";

import { useEffect, useState } from "react";

type Notice = { id: number; type: "success" | "info" | "warning" | "error"; message: React.ReactNode; description?: React.ReactNode; duration?: number };

export function NotificationHost() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Omit<Notice, "id">>).detail;
      const notice = { ...detail, id: Date.now() + Math.random() };
      setNotices((current) => [...current.slice(-2), notice]);
      window.setTimeout(() => setNotices((current) => current.filter((item) => item.id !== notice.id)), (detail.duration ?? 4.5) * 1000);
    };
    window.addEventListener("family-notice", receive);
    return () => window.removeEventListener("family-notice", receive);
  }, []);
  return <div aria-live="polite" className="notice-stack">{notices.map((notice) => <div className={`notice notice-${notice.type}`} key={notice.id} role={notice.type === "error" ? "alert" : "status"}><strong>{notice.message}</strong>{notice.description ? <span>{notice.description}</span> : null}<button aria-label="关闭提示" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} type="button">×</button></div>)}</div>;
}
