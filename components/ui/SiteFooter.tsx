/** Global site credit — rendered on every page via root layout. */
export function SiteFooter() {
  return (
    <footer className="relative z-0 mt-auto border-t border-line-subtle/80 bg-ink-950">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-6 py-5 md:px-10">
        <p className="font-display text-sm uppercase tracking-[0.14em] text-gold-400">
          <span className="text-gold-300">@2026</span>
          <span className="mx-2 text-gold-500/70">·</span>
          <span>Made by MiMs</span>
        </p>
      </div>
    </footer>
  );
}
