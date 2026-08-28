"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { SignInGate } from "@/components/auth/SignInGate";
import { PublicRecordNotice } from "@/components/legal/PublicRecordNotice";
import { KeyGate } from "@/components/settings/KeyGate";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  API_KEY_CHANGED_EVENT,
  hasStoredApiKey,
} from "@/lib/client/apiKey";

export type ServiceAccessGateProps = {
  isDemo?: boolean;
  serverConfigured: boolean;
  heading: string;
  /** When set, the public-record notice shows before sign-in and key steps. */
  noticeKind?: "run" | "playground" | "pack";
  signInTitle: string;
  signInBody: string;
  signInTestId: string;
  keyTitle: string;
  keyBody: string;
  keyTestId: string;
  viewHref?: string;
  viewLabel?: string;
  /** Skip the outer heading chrome — parent already rendered it. */
  embed?: boolean;
  children: React.ReactNode;
};

function GateChrome({
  heading,
  noticeKind,
  viewHref,
  viewLabel,
  children,
}: {
  heading: string;
  noticeKind?: ServiceAccessGateProps["noticeKind"];
  viewHref?: string;
  viewLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8 md:px-10">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
        {heading}
      </h1>
      {noticeKind ? (
        <PublicRecordNotice kind={noticeKind} className="mt-4" />
      ) : null}
      {children}
      {viewHref && viewLabel ? (
        <p className="mt-6 text-center">
          <Link href={viewHref} className={buttonClasses({ variant: "secondary" })}>
            {viewLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Login first, then a browser (or dev-env) OpenRouter key, then the service.
 * Demo deep-links skip the gate. Viewing public records stays outside this.
 */
export function ServiceAccessGate({
  isDemo = false,
  serverConfigured,
  heading,
  noticeKind,
  signInTitle,
  signInBody,
  signInTestId,
  keyTitle,
  keyBody,
  keyTestId,
  viewHref,
  viewLabel,
  embed = false,
  children,
}: ServiceAccessGateProps) {
  const { status } = useSession();
  const [ready, setReady] = useState(isDemo || serverConfigured);
  const [hasKey, setHasKey] = useState(isDemo || serverConfigured);

  useEffect(() => {
    if (isDemo || serverConfigured) {
      setHasKey(true);
      setReady(true);
      return;
    }
    const sync = () => setHasKey(hasStoredApiKey());
    sync();
    setReady(true);
    window.addEventListener(API_KEY_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(API_KEY_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [isDemo, serverConfigured]);

  if (isDemo) return children;

  if (status === "loading" || !ready) {
    return (
      <div
        className={
          embed
            ? "h-48 animate-pulse rounded-md border border-line-subtle bg-ink-900"
            : "mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8 md:px-10"
        }
        aria-busy="true"
        aria-label="Checking access"
      >
        {!embed ? (
          <>
            <div className="h-8 w-56 animate-pulse rounded-md bg-ink-800" />
            <div className="h-48 animate-pulse rounded-md border border-line-subtle bg-ink-900" />
          </>
        ) : null}
      </div>
    );
  }

  if (status !== "authenticated") {
    const gate = (
      <SignInGate
        testId={signInTestId}
        title={signInTitle}
        body={signInBody}
      />
    );
    if (embed) {
      return (
        <div>
          {gate}
          {viewHref && viewLabel ? (
            <p className="mt-6 text-center">
              <Link href={viewHref} className={buttonClasses({ variant: "secondary" })}>
                {viewLabel}
              </Link>
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <GateChrome
        heading={heading}
        noticeKind={noticeKind}
        viewHref={viewHref}
        viewLabel={viewLabel}
      >
        {gate}
      </GateChrome>
    );
  }

  if (!hasKey) {
    const keyBlock = (
      <>
        <EmptyState
          className="mt-6"
          title={keyTitle}
          body={keyBody}
        />
        <div className="mt-4" data-testid={keyTestId}>
          <KeyGate serverConfigured={serverConfigured} />
        </div>
      </>
    );
    if (embed) return <div>{keyBlock}</div>;
    return (
      <GateChrome
        heading={heading}
        noticeKind={noticeKind}
        viewHref={viewHref}
        viewLabel={viewLabel}
      >
        {keyBlock}
      </GateChrome>
    );
  }

  return children;
}
