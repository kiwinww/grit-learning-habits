"use client";

import { useEffect, useRef, useState } from "react";
import { Loading } from "animal-island-ui";

type LoadingPhase = "idle" | "open" | "closing";

const MINIMUM_VISIBLE_MS = 320;

function radialExitDuration() {
  const radius = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight) / 2) + 50;
  return Math.max(100, (radius / 1500) * 1000);
}

export function FullscreenLoading({ active, motionEnabled = true, label = "正在处理…", onExited }: { active: boolean; motionEnabled?: boolean; label?: string; onExited?: () => void }) {
  const [hasActivated, setHasActivated] = useState(active);
  const [componentActive, setComponentActive] = useState(active);
  const [phase, setPhase] = useState<LoadingPhase>(active ? "open" : "idle");
  const openedAt = useRef(active ? Date.now() : 0);
  const requestedActive = useRef(active);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitedRef = useRef(onExited);

  onExitedRef.current = onExited;

  useEffect(() => {
    const clearTimers = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      closeTimer.current = null;
      exitTimer.current = null;
    };

    clearTimers();
    if (active) {
      if (!requestedActive.current) openedAt.current = Date.now();
      requestedActive.current = true;
      setHasActivated(true);
      setComponentActive(true);
      setPhase("open");
      return clearTimers;
    }

    requestedActive.current = false;
    if (!hasActivated) return clearTimers;

    const reduceMotion = !motionEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const remaining = reduceMotion ? 0 : Math.max(0, MINIMUM_VISIBLE_MS - (Date.now() - openedAt.current));
    closeTimer.current = setTimeout(() => {
      setComponentActive(false);
      setPhase("closing");
      exitTimer.current = setTimeout(() => {
        setPhase("idle");
        onExitedRef.current?.();
      }, reduceMotion ? 110 : radialExitDuration());
    }, remaining);

    return clearTimers;
  }, [active, hasActivated, motionEnabled]);

  if (!hasActivated) return null;
  return (
    <div
      aria-hidden={phase !== "open"}
      aria-live={phase === "open" ? "polite" : "off"}
      aria-label={phase === "open" ? label : undefined}
      className={`fullscreen-loading is-${phase}${motionEnabled ? "" : " is-static"}`}
      data-phase={phase}
      role={phase === "open" ? "status" : undefined}
    >
      <Loading active={componentActive} />
      {phase === "open" ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}
