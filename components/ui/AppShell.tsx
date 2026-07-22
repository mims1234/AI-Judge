"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  API_KEY_CHANGED_EVENT,
  hasStoredApiKey,
} from "@/lib/client/apiKey";
import { StatusDot } from "@/components/ui/StatusDot";

const NAV_LINKS = [
  { href: "/models", label: "Models" },
  { href: "/bundles", label: "Bundles" },
  { href: "/runs", label: "Runs", match: ["/run", "/runs"] },
  { href: "/playground", label: "Playground", match: ["/playground"] },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/compare", label: "Compare" },
  { href: "/judges", label: "Judges" },
  { href: "/settings", label: "Settings" },
] as const;

function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="text-teal-400"
      >
        <rect x="1.5" y="9" width="3" height="5.5" rx="0.5" fill="currentColor" opacity="0.55" />
        <rect x="6.5" y="5" width="3" height="9.5" rx="0.5" fill="currentColor" opacity="0.8" />
        <rect x="11.5" y="1.5" width="3" height="13" rx="0.5" fill="currentColor" />
      </svg>
      <span className="font-display text-lg uppercase tracking-[0.08em] text-bright">
        AI Judge
      </span>
    </span>
  );
}

function isActive(pathname: string, href: string, match?: readonly string[]): boolean {
  const prefixes = match ?? [href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function linkClasses(active: boolean): string {
  return cn(
    "rounded-sm px-2.5 py-1.5 text-sm transition-colors duration-150",
    active
      ? "bg-teal-900 text-teal-300"
      : "text-dim hover:bg-ink-800 hover:text-bright",
  );
}

type RunningRun = { id: string };

/** Top nav: wordmark, route links, run-in-progress indicator (polled 30s). */
export function AppShell({
  serverConfigured = false,
}: {
  serverConfigured?: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRun, setActiveRun] = useState<RunningRun | null>(null);
  const [needsBrowserKey, setNeedsBrowserKey] = useState(false);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // BYOK nav hint — only when neither browser key nor dev env fallback exists.
  useEffect(() => {
    const sync = () => {
      setNeedsBrowserKey(!serverConfigured && !hasStoredApiKey());
    };
    sync();
    window.addEventListener(API_KEY_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(API_KEY_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [serverConfigured]);

  // Run-in-progress indicator — cheap poll, silent on failure.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/runs?status=running&limit=1", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { runs?: RunningRun[] };
        if (!cancelled) setActiveRun(json.runs?.[0] ?? null);
      } catch {
        // Indicator is best-effort; never surface errors in the nav.
      }
    };
    void poll();
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);

  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setMenuOpen(false);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-ink-950/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-6 md:px-10">
        <Link href="/" aria-label="AI Judge home" className="shrink-0">
          <BrandMark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={linkClasses(isActive(pathname, link.href, "match" in link ? link.match : undefined))}
              aria-current={isActive(pathname, link.href, "match" in link ? link.match : undefined) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {needsBrowserKey && pathname !== "/settings" && (
            <Link
              href="/settings"
              className="flex items-center gap-2 rounded-sm border border-warn-400/40 bg-warn-900/50 px-2.5 py-1.5 text-xs text-warn-400 transition-colors duration-150 hover:border-warn-400/70"
            >
              <StatusDot tone="error" />
              Add API key
            </Link>
          )}

          {activeRun && (
            <Link
              href={`/runs/${activeRun.id}`}
              className="flex items-center gap-2 rounded-sm border border-teal-400/30 bg-teal-900 px-2.5 py-1.5 text-xs text-teal-300 transition-colors duration-150 hover:border-teal-400/60"
            >
              <StatusDot tone="streaming" />
              Run in progress
            </Link>
          )}

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-body hover:bg-ink-800 hover:text-bright lg:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((v) => !v)}
            onKeyDown={onMenuKeyDown}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          aria-label="Mobile"
          className="border-t border-line-subtle bg-ink-900 px-6 py-3 lg:hidden"
          onKeyDown={onMenuKeyDown}
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  linkClasses(isActive(pathname, link.href, "match" in link ? link.match : undefined)),
                  "px-3 py-2.5",
                )}
                aria-current={isActive(pathname, link.href, "match" in link ? link.match : undefined) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
