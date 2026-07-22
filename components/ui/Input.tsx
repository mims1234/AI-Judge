import { cn } from "@/lib/cn";

/* Inputs, selects, checkboxes, radio cards (plans/07 §3.8). Server-safe:
   no hooks — controlled state lives in the consumer. */

const FIELD_BASE =
  "rounded-md border border-line-strong bg-ink-950 px-3 py-2 text-sm text-body placeholder:text-faint transition-colors duration-150 focus:border-teal-400 focus:ring-1 focus:ring-teal-400";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({ className, ref, ...rest }: InputProps) {
  return <input ref={ref} className={cn(FIELD_BASE, className)} {...rest} />;
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        className={cn(FIELD_BASE, "w-full cursor-pointer appearance-none pr-8")}
        {...rest}
      >
        {children}
      </select>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dim"
      >
        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label: React.ReactNode;
  description?: string;
};

export function Checkbox({ label, description, className, ...rest }: CheckboxProps) {
  return (
    <label className={cn("group inline-flex cursor-pointer items-start gap-2.5", className)}>
      <input type="checkbox" className="peer sr-only" {...rest} />
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-ink-950 transition-colors duration-150",
          "peer-checked:border-teal-500 peer-checked:bg-teal-500",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-400",
        )}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-ink-950 opacity-0 transition-opacity duration-150 peer-checked:opacity-100">
          <path d="M1.5 5.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm text-body transition-colors duration-150 group-hover:text-bright">
        {label}
        {description && <span className="mt-0.5 block text-xs text-dim">{description}</span>}
      </span>
    </label>
  );
}

export type RadioCardProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  children: React.ReactNode;
};

/** Large selectable card — selected state border-teal-400 bg-teal-900. */
export function RadioCard({ children, className, ...rest }: RadioCardProps) {
  return (
    <label className={cn("block cursor-pointer", className)}>
      <input type="radio" className="peer sr-only" {...rest} />
      <span
        className={cn(
          "block rounded-md border border-line-strong bg-ink-900 p-4 transition-colors duration-150",
          "peer-checked:border-teal-400 peer-checked:bg-teal-900",
          "peer-hover:border-ink-600",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-400",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        )}
      >
        {children}
      </span>
    </label>
  );
}
