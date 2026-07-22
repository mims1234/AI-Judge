import type { Metadata } from "next";
import type { PickerModel } from "@/components/models/ModelPicker";
import { PlaygroundApp } from "@/components/playground/PlaygroundApp";
import { buildDemoCatalog } from "@/lib/mocks/catalog";
import { getCachedCatalog, getModelCatalog, hasServerKey } from "@/lib/openrouter";
import { listRecentChatSessions } from "@/lib/server/chatAnalytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat playground",
};

type SearchParams = Promise<{ session?: string; demo?: string }>;

function strip(
  models: Array<{
    id: string;
    name: string;
    context_length: number;
    pricing: {
      prompt_usd_per_m: number;
      completion_usd_per_m: number;
    } | null;
    is_free: boolean;
    supports_structured_outputs: boolean;
  }>,
): PickerModel[] {
  return models.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    context_length: m.context_length ?? 0,
    pricing: m.pricing,
    is_free: m.is_free,
    supports_structured_outputs: m.supports_structured_outputs,
  }));
}

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const isDemo = sp.demo === "1";

  const catalog = isDemo
    ? { models: buildDemoCatalog() }
    : hasServerKey()
      ? await getModelCatalog().catch(() => getCachedCatalog())
      : getCachedCatalog();
  const models = catalog ? strip(catalog.models) : [];
  const recentSessions = listRecentChatSessions({ limit: 12 });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal-300">
          Playground
        </p>
        <h1 className="font-display text-3xl uppercase tracking-[0.06em] text-bright md:text-4xl">
          Chat & judge
        </h1>
        <p className="max-w-2xl text-sm text-dim">
          Free-form conversation with one candidate, then a multi-judge panel
          that classifies the transcript and scores it with the matching
          category rubric. Reopen recent chats to inspect transcripts and
          judging.
        </p>
      </header>
      <PlaygroundApp
        models={models}
        catalogEmpty={models.length === 0}
        initialSessionId={sp.session ?? null}
        recentSessions={recentSessions}
      />
    </div>
  );
}
