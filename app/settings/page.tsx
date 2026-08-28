import type { Metadata } from "next";
import { pageSeo } from "@/lib/seo";
import { SignInGate } from "@/components/auth/SignInGate";
import { ApiKeyCard } from "@/components/settings/ApiKeyCard";
import { DataCard } from "@/components/settings/DataCard";
import { SettingsForm } from "@/components/settings/SettingsForm";
import {
  getAppSettings,
  getDbStats,
  getKeyStatusInfo,
} from "@/lib/server/appSettings";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Settings",
  description:
    "Workspace settings: API key status, concurrency, trials, budget, and data facts.",
  path: "/settings",
  index: false,
});

/** Operator defaults — key status, run defaults, data facts (plans/08 §4). */
export default async function SettingsPage() {
  const user = await getSessionUser();
  const keyStatus = getKeyStatusInfo();
  const settings = getAppSettings();
  const dbStats = getDbStats();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10 md:px-10">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
        Settings
      </h1>

      {!user ? (
        <SignInGate
          testId="settings-needs-login"
          title="Sign in to open Settings"
          body="Sign in first. Then add your OpenRouter key. Run defaults on this page apply to the whole host. Viewing bundles and past runs stays open."
        />
      ) : (
        <>
          <ApiKeyCard status={keyStatus} />
          <SettingsForm initial={settings} />
          <DataCard stats={dbStats} />
        </>
      )}
    </div>
  );
}
