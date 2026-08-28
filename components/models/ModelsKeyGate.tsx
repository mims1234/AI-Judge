"use client";

import { ServiceAccessGate } from "@/components/auth/ServiceAccessGate";

/**
 * Live catalog stays hidden until Discord sign-in and this browser has an
 * OpenRouter key (or the server has a dev env fallback).
 */
export function ModelsKeyGate({
  isDemo = false,
  serverConfigured,
  children,
}: {
  isDemo?: boolean;
  serverConfigured: boolean;
  children: React.ReactNode;
}) {
  return (
    <ServiceAccessGate
      embed
      isDemo={isDemo}
      serverConfigured={serverConfigured}
      heading="Models"
      signInTitle="Sign in to view models"
      signInBody="Sign in first. Then add an OpenRouter key to load the live catalog."
      signInTestId="models-needs-login"
      keyTitle="Add an OpenRouter key to view models"
      keyBody="Paste your key below. The catalog stays hidden until it is saved in this browser."
      keyTestId="models-needs-key"
    >
      {children}
    </ServiceAccessGate>
  );
}
