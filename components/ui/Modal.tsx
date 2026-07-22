"use client";

import { cn } from "@/lib/cn";
import { useDialogElement } from "@/components/ui/Drawer";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testId?: string;
  wide?: boolean;
};

/** Centered dialog — focus-trapped, Esc closes, backdrop click closes (plans/07 §3.8). */
export function Modal({ open, onClose, title, children, footer, testId, wide = false }: ModalProps) {
  const ref = useDialogElement(open, onClose);
  if (!open) return null;

  return (
    <dialog
      ref={ref}
      data-testid={testId}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] overflow-y-auto",
        wide ? "w-[min(56rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]",
        "max-w-none rounded-lg border border-line-strong bg-ink-850 p-0 text-body",
        "shadow-[0_8px_32px_rgba(0,0,0,0.5)] modal-in",
      )}
    >
      <div className="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0 flex-1 text-base text-bright">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}
