import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/legal";

/** Global site credit — rendered on every page via root layout. */
export function SiteFooter() {
  return (
    <footer className="relative z-0 mt-auto border-t border-line-subtle/80 bg-ink-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-3 px-6 py-5 md:px-10">
        <nav aria-label="Lab policy" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          {LEGAL_LINKS.map((link, i) => (
            <span key={link.href} className="flex items-center gap-3">
              {i > 0 ? <span className="text-faint" aria-hidden="true">·</span> : null}
              <Link
                href={link.href}
                className="text-dim transition-colors hover:text-teal-300"
              >
                {link.label}
              </Link>
            </span>
          ))}
        </nav>
        <p className="font-display text-sm uppercase tracking-[0.14em] text-gold-400">
          <span className="text-gold-300">@2026</span>
          <span className="mx-2 text-gold-500/70">·</span>
          <span>Made by MiMs</span>
        </p>
      </div>
    </footer>
  );
}
