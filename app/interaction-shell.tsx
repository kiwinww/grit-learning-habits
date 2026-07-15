"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Cursor } from "animal-island-ui";

const MOTION_STORAGE_KEY = "family-star-motion";

function applyMotionPreference(enabled: boolean) {
  document.documentElement.classList.toggle("family-reduce-motion", !enabled);
}

export function InteractionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    delete document.documentElement.dataset.routeLeaving;
    const saved = window.localStorage.getItem(MOTION_STORAGE_KEY);
    if (saved !== null) applyMotionPreference(saved === "on");
  }, [pathname]);

  return <Cursor className="interaction-shell">{children}</Cursor>;
}

export function MotionPreference({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, enabled ? "on" : "off");
    applyMotionPreference(enabled);
  }, [enabled]);

  return null;
}
