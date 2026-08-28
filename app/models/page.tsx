import type { Metadata } from "next";
import Link from "next/link";
import { pageSeo } from "@/lib/seo";
import { CatalogHeader } from "@/components/models/CatalogHeader";
import { ModelsClient, type ModelExtras } from "@/components/models/ModelDetailDrawer";
import { ModelsKeyGate } from "@/components/models/ModelsKeyGate";
import type { PickerModel } from "@/components/models/ModelPicker";
import { buttonClasses } from "@/components/ui/Button";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getCachedCatalog,
  getModelCatalog,
  hasServerKey,
} from "@/lib/openrouter";
import { buildDemoCatalog, DEMO_CATALOG_FETCHED_AT } from "@/lib/mocks/catalog";
import { getKeyStatusInfo } from "@/lib/server/appSettings";
import { getModelExtras } from "@/lib/server/catalog";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Models",
  description:
    "Browse 400+ OpenRouter models — context length, pricing, and live availability — then pick candidates for a blind benchmark run.",
  path: "/models",
});

type SearchParams = Promise<{ model?: string; demo?: string }>;

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

export default async function ModelsPage({ searchParams }: { searchParams: SearchParams }) {
  const { model: selectedId, demo } = await searchParams;
  const isDemo = demo === "1";
  const keyStatus = getKeyStatusInfo();
  const user = await getSessionUser();

  // RSC can't see the browser BYOK key — use live fetch only when a server
  // (dev) key exists; otherwise serve the SQLite cache. Skip the catalog
  // until sign-in so logged-out visitors are not blocked on OpenRouter.
  const catalog = !isDemo && !user
    ? null
    : isDemo
    ? { source: "demo" as const, fetched_at: DEMO_CATALOG_FETCHED_AT, models: buildDemoCatalog() }
    : hasServerKey()
      ? await getModelCatalog().catch(() => getCachedCatalog())
      : getCachedCatalog();

  if (!catalog) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10 md:px-10">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">Models</h1>
        <ModelsKeyGate isDemo={isDemo} serverConfigured={keyStatus.serverConfigured}>
          <EmptyState
            className="mt-6 flex-1"
            title="Could not load the model catalog."
            body="Refresh after adding your key, or retry if the catalog request failed."
            action={
              <Link href="/models" className={buttonClasses({ variant: "secondary" })}>
                Retry
              </Link>
            }
          />
        </ModelsKeyGate>
      </div>
    );
  }

  const models = strip(catalog.models);
  const selectedModel = selectedId ? (models.find((m) => m.id === selectedId) ?? null) : null;
  const selectedExtras: ModelExtras | null = selectedModel
    ? isDemo
      ? {
          description: `Demo description for ${selectedModel.name}. In live mode this text comes from the OpenRouter catalog entry for ${selectedModel.id}.`,
          supportedParameters: selectedModel.supports_structured_outputs
            ? ["response_format", "structured_outputs", "temperature", "max_tokens", "tools"]
            : ["temperature", "max_tokens"],
        }
      : (getModelExtras(selectedModel.id) ?? { description: null, supportedParameters: [] })
    : null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-7xl flex-col px-6 py-6 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
          Models
        </h1>
      </div>
      <ModelsKeyGate isDemo={isDemo} serverConfigured={keyStatus.serverConfigured}>
        {isDemo ? (
          <>
            <CatalogHeader
              count={models.length}
              fetchedAt={catalog.fetched_at}
              source={catalog.source}
            />
            <DemoBanner className="mt-4" note="Demo catalog — pricing and availability are simulated." />
            <ModelsClient models={models} selectedModel={selectedModel} selectedExtras={selectedExtras} />
          </>
        ) : (
          <>
            <div className="mt-2 flex justify-end">
              <CatalogHeader
                count={models.length}
                fetchedAt={catalog.fetched_at}
                source={catalog.source}
              />
            </div>
            <ModelsClient models={models} selectedModel={selectedModel} selectedExtras={selectedExtras} />
          </>
        )}
      </ModelsKeyGate>
    </div>
  );
}
