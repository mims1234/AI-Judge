"use client";

import { ServiceAccessGate } from "@/components/auth/ServiceAccessGate";

/**
 * Configure-run stays hidden until Discord sign-in and a browser (or
 * dev-env) OpenRouter key. Demo catalog deep-links skip the gate.
 */
export function CreateRunGate({
  isDemo,
  serverConfigured,
  children,
}: {
  isDemo: boolean;
  serverConfigured: boolean;
  children: React.ReactNode;
}) {
  return (
    <ServiceAccessGate
      isDemo={isDemo}
      serverConfigured={serverConfigured}
      heading="Configure run"
      noticeKind="run"
      signInTitle="Sign in to configure a run"
      signInBody="Sign in first. Then add an OpenRouter key. Viewing past runs stays open."
      signInTestId="run-needs-login"
      keyTitle="Add an OpenRouter key to configure a run"
      keyBody="Paste your key below. Launching bills through your key. Viewing existing runs stays open."
      keyTestId="run-needs-key"
      viewHref="/runs"
      viewLabel="View existing runs"
    >
      {children}
    </ServiceAccessGate>
  );
}
