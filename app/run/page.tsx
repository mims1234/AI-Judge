import type { Metadata } from "next";
import { Suspense } from "react";
import type { PickerModel } from "@/components/models/ModelPicker";
import { RunWizard } from "@/components/run/RunWizard";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildDemoCatalog } from "@/lib/mocks/catalog";
import {
  getCachedCatalog,
  getModelCatalog,
  hasServerKey,
} from "@/lib/openrouter";
import { getAppSettings, getKeyStatusInfo } from "@/lib/server/appSettings";
import {
  getBundleTasks,
  listBundles,
  sortBundlesForPicker,
} from "@/lib/server/bundles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configure run",
};

type SearchParams = Promise<{ step?: string; candidates?: string; demo?: string }>;

function strip(models: Array<{
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt_usd_per_m: number; completion_usd_per_m: number } | null;
  is_free: boolean;
  supports_structured_outputs: boolean;
}>): PickerModel[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    context_length: m.context_length ?? 0,
    pricing: m.pricing,
    is_free: m.is_free,
    supports_structured_outputs: m.supports_structured_outputs,
  }));
}

function WizardFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 md:px-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default async function RunPage({ searchParams }: { searchParams: SearchParams }) {
  const { demo } = await searchParams;
  const isDemo = demo === "1";

  const published = sortBundlesForPicker(
    listBundles().filter((b) => b.status === "published"),
  );
  const bundles = published.map((b) => ({
    ...b,
    categoryCount: getBundleTasks(b.id).length,
  }));

  const maxTokenByBundle: Record<string, number> = {};
  for (const b of published) {
    const tasks = getBundleTasks(b.id);
    maxTokenByBundle[b.id] = tasks.reduce((m, t) => Math.max(m, t.token_limit), 0);
  }

  const catalog = isDemo
    ? { models: buildDemoCatalog() }
    : hasServerKey()
      ? await getModelCatalog().catch(() => getCachedCatalog())
      : getCachedCatalog();

  const models = catalog ? strip(catalog.models) : [];
  const settings = getAppSettings();
  const keyStatus = getKeyStatusInfo();

  return (
    <Suspense fallback={<WizardFallback />}>
      <RunWizard
        bundles={bundles}
        maxTokenByBundle={maxTokenByBundle}
        models={models}
        settings={settings}
        isDemo={isDemo}
        serverConfigured={keyStatus.serverConfigured}
      />
    </Suspense>
  );
}
