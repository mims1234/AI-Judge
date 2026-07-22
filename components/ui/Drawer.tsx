"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Shared <dialog> lifecycle: open/close, Esc (cancel), backdrop click,
 * scroll lock. Native showModal gives us the focus trap + focus restore.
 */
export function useDialogElement(
  open: boolean,
  onClose: () => void,
): React.RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dlg.open) {
      dlg.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    const handleClick = (e: MouseEvent) => {
      const r = dlg.getBoundingClientRect();
      const inDialog =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inDialog) onCloseRef.current();
    };
    dlg.addEventListener("cancel", handleCancel);
    dlg.addEventListener("click", handleClick);
    return () => {
      dlg.removeEventListener("cancel", handleCancel);
      dlg.removeEventListener("click", handleClick);
    };
  }, []);

  return ref;
}

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testId?: string;
  ariaLabel?: string;
};

/** Right-side sheet on a native <dialog> — focus-trapped, Esc closes (plans/07 §3.8). */
export function Drawer({
  open,
  onClose,
  title,
  headerAside,
  children,
  footer,
  testId,
  ariaLabel,
}: DrawerProps) {
  const ref = useDialogElement(open, onClose);
  if (!open) return null;

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      className={cn(
        "fixed right-0 top-0 m-0 h-dvh max-h-none w-[min(720px,100vw)] max-w-none",
        "border-0 border-l border-line-strong bg-ink-850 p-0 text-body",
        "shadow-[0_8px_32px_rgba(0,0,0,0.5)] drawer-in",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          {headerAside}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="border-t border-line-subtle px-5 py-3">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
