"use client";

import { AuthBar } from "@/components/auth/AuthBar";
import { useAuthFlags } from "@/components/auth/AuthProviders";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

export function SignInGate({
  title,
  body,
  testId,
  variant = "page",
}: {
  title: string;
  body: string;
  testId?: string;
  variant?: "page" | "banner";
}) {
  const { canDevSignIn, canDiscordSignIn } = useAuthFlags();
  const canSignIn = canDevSignIn || canDiscordSignIn;
  const resolvedBody = canSignIn
    ? body
    : "This deployment has no sign-in provider configured.";

  if (variant === "banner") {
    return (
      <div
        data-testid={testId}
        className="rounded-md border border-line-strong bg-ink-900 px-4 py-3"
      >
        <p className="text-sm font-medium text-bright">{title}</p>
        <p className="mt-1 text-sm text-dim">{resolvedBody}</p>
        {canSignIn && (
          <div className="mt-3">
            <AuthBar compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid={testId} className={cn(variant === "page" && "mt-6")}>
      <EmptyState
        title={title}
        body={resolvedBody}
        action={canSignIn ? <AuthBar compact /> : undefined}
      />
    </div>
  );
}
