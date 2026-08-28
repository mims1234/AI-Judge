"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function privacyBlocked(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === "1" || nav.doNotTrack === "yes") return true;
  if (nav.globalPrivacyControl) return true;
  return false;
}

/** First-party pageview beacon. Daily rollups only — no query strings, no PII. */
export function ViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    if (privacyBlocked()) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    last.current = pathname;

    const body = JSON.stringify({ path: pathname });
    const blob = new Blob([body], { type: "application/json" });
    let queued = false;
    try {
      if (typeof navigator.sendBeacon === "function") {
        queued = navigator.sendBeacon("/api/traffic/hit", blob);
      }
    } catch {
      queued = false;
    }
    if (queued) return;
    void fetch("/api/traffic/hit", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {
      // analytics is best-effort
    });
  }, [pathname]);

  return null;
}
