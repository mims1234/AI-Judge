import type { Metadata } from "next";
import { ApiKeyCard } from "@/components/settings/ApiKeyCard";
import { DataCard } from "@/components/settings/DataCard";
import { SettingsForm } from "@/components/settings/SettingsForm";
import {
  getAppSettings,
  getDbStats,
  getKeyStatusInfo,
} from "@/lib/server/appSettings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
};

/** Operator defaults — key status, run defaults, data facts (plans/08 §4). */
export default function SettingsPage() {
  const keyStatus = getKeyStatusInfo();
  const settings = getAppSettings();
  const dbStats = getDbStats();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10 md:px-10">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
        Settings
      </h1>

      <ApiKeyCard status={keyStatus} />
      <SettingsForm initial={settings} />
      <DataCard stats={dbStats} />
    </div>
  );
}
