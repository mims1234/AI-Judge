import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean; // swaps label for spinner, keeps width
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-teal-500 text-ink-950 font-medium hover:bg-teal-400 active:bg-teal-600",
  secondary: "border border-line-strong bg-ink-800 text-bright hover:bg-ink-700",
  ghost: "text-body hover:bg-ink-800 hover:text-bright",
  danger: "border border-fail-400/30 bg-fail-900 text-fail-400 hover:border-fail-400/60",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  return cn(
    "relative inline-flex select-none items-center justify-center gap-2 rounded-md transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[opts?.variant ?? "primary"],
    SIZES[opts?.size ?? "md"],
    opts?.className,
  );
}

function Spinner() {
  return (
    <svg
      className="absolute h-4 w-4 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
    </button>
  );
}
