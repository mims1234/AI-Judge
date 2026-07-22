"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type Announcer = {
  announce: (message: string) => void;
};

const AnnouncerContext = createContext<Announcer | null>(null);

/**
 * Single visually-hidden aria-live="polite" region mounted in the root layout
 * (plans/07 §3.10). All async status changes route through useAnnounce();
 * identical messages are debounced within 2s.
 */
export function StatusAnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const padRef = useRef(false);

  const announce = useCallback((text: string) => {
    const now = Date.now();
    const last = lastRef.current;
    if (last.text === text && now - last.at < 2000) return; // debounce dupes
    lastRef.current = { text, at: now };
    // Alternate a zero-width suffix so repeating the same message still
    // registers as a DOM change for screen readers.
    padRef.current = !padRef.current;
    setMessage(text + (padRef.current ? " " : ""));
  }, []);

  const value = useMemo(() => ({ announce }), [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        data-testid="status-announcer"
        className="sr-only"
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnounce(): (message: string) => void {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) {
    // Outside the provider (shouldn't happen) — no-op rather than crash.
    return () => {};
  }
  return ctx.announce;
}
