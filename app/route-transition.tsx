"use client";

import { useCallback, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

const EXIT_DURATION = 160;
let pendingNavigation: number | undefined;

export function shouldReduceMotion(enabled = true) {
  return !enabled
    || document.documentElement.classList.contains("family-reduce-motion")
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearLeavingState() {
  delete document.documentElement.dataset.routeLeaving;
}

export function useRouteTransition(enabled = true) {
  const router = useRouter();

  return useCallback((href: string) => {
    const target = new URL(href, window.location.href);
    const current = new URL(window.location.href);

    if (pendingNavigation !== undefined) {
      window.clearTimeout(pendingNavigation);
      pendingNavigation = undefined;
    }

    if (target.pathname === current.pathname && target.search === current.search && target.hash === current.hash) {
      clearLeavingState();
      window.scrollTo({ top: 0, behavior: shouldReduceMotion(enabled) ? "auto" : "smooth" });
      return;
    }

    if (shouldReduceMotion(enabled)) {
      clearLeavingState();
      router.push(href);
      return;
    }

    document.documentElement.dataset.routeLeaving = "true";
    pendingNavigation = window.setTimeout(() => {
      pendingNavigation = undefined;
      router.push(href);
      window.setTimeout(clearLeavingState, 500);
    }, EXIT_DURATION);
  }, [enabled, router]);
}

type TransitionLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  motionEnabled?: boolean;
};

export function TransitionLink({ href, motionEnabled = true, onClick, target, ...props }: TransitionLinkProps) {
  const navigate = useRouteTransition(motionEnabled);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || target === "_blank"
    ) return;

    event.preventDefault();
    navigate(href);
  }

  return <a {...props} href={href} onClick={handleClick} target={target} />;
}

export async function waitForViewExit(enabled = true) {
  if (shouldReduceMotion(enabled)) return;
  await new Promise<void>((resolve) => window.setTimeout(resolve, EXIT_DURATION));
}
