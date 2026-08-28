"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthFlags } from "@/components/auth/AuthProviders";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("h-3.5 w-3.5", className)}
    >
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

function AvatarFallback({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 font-mono text-[10px] uppercase text-teal-300 ring-1 ring-line-strong"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function AuthBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { canDevSignIn, canDiscordSignIn } = useAuthFlags();
  const [busyProvider, setBusyProvider] = useState<"discord" | "dev" | null>(null);

  if (status === "loading") {
    return (
      <span
        className="inline-block h-7 w-24 animate-pulse rounded-sm bg-ink-800"
        data-testid="auth-loading"
        aria-label="Checking sign-in state"
      />
    );
  }

  if (session?.user?.id) {
    const name = session.user.name ?? "Signed in";
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 whitespace-nowrap",
          !compact && "border-l border-line-subtle pl-3",
        )}
        data-testid="auth-bar"
      >
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full ring-1 ring-line-strong"
          />
        ) : (
          <AvatarFallback name={name} />
        )}
        <span
          className="max-w-[9rem] truncate text-sm text-body"
          data-testid="signed-in-user"
          title={session.user.name ?? session.user.id}
        >
          {name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="sign-out"
          className="text-dim"
          onClick={() => {
            void signOut({ redirect: false }).then(() => router.refresh());
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  if (!canDevSignIn && !canDiscordSignIn) return null;

  return (
    <div
      className={cn(
        compact
          ? "flex flex-col gap-2"
          : "flex items-center gap-2 border-l border-line-subtle pl-3",
      )}
      data-testid="auth-bar"
    >
      {canDiscordSignIn && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="discord-signin"
          loading={busyProvider === "discord"}
          onClick={() => {
            setBusyProvider("discord");
            void signIn("discord");
          }}
        >
          <DiscordMark />
          Sign in with Discord
        </Button>
      )}
      {canDevSignIn && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="dev-signin"
          loading={busyProvider === "dev"}
          className="text-dim"
          onClick={() => {
            setBusyProvider("dev");
            void signIn("dev", { username: "Dev", redirect: false })
              .then(() => router.refresh())
              .finally(() => setBusyProvider(null));
          }}
        >
          Dev sign-in
        </Button>
      )}
    </div>
  );
}
