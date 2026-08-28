import type { Metadata } from "next";
import { pageSeo } from "@/lib/seo";
import { ServiceAccessGate } from "@/components/auth/ServiceAccessGate";
import type { PickerModel } from "@/components/models/ModelPicker";
import { PublicRecordNotice } from "@/components/legal/PublicRecordNotice";
import { PlaygroundApp } from "@/components/playground/PlaygroundApp";
import { buildDemoCatalog } from "@/lib/mocks/catalog";
import { getCachedCatalog, getModelCatalog, hasServerKey } from "@/lib/openrouter";
import { getKeyStatusInfo } from "@/lib/server/appSettings";
import { listRecentChatSessions } from "@/lib/server/chatAnalytics";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Chat playground",
  description:
    "Chat playground with live streaming, category rubrics, and optional three-judge scoring — a lighter way to try the AI Judge method.",
  path: "/playground",
});

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
  const keyStatus = getKeyStatusInfo();
  const user = await getSessionUser();
  const canLoadCatalog = isDemo || Boolean(user);

  const catalog = !canLoadCatalog
    ? null
    : isDemo
      ? { models: buildDemoCatalog() }
      : hasServerKey()
        ? await getModelCatalog().catch(() => getCachedCatalog())
        : getCachedCatalog();
  const models = catalog ? strip(catalog.models) : [];
  const recentSessions = canLoadCatalog
    ? listRecentChatSessions({ limit: 12 })
    : [];

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
          Sign in, add your OpenRouter key, then chat with one candidate and
          score the transcript with a three-judge panel. Reopen recent chats
          to inspect transcripts and judging.
        </p>
        <PublicRecordNotice kind="playground" className="mt-2 max-w-2xl" />
      </header>
      <ServiceAccessGate
        embed
        isDemo={isDemo}
        serverConfigured={keyStatus.serverConfigured}
        heading="Chat & judge"
        signInTitle="Sign in to use the playground"
        signInBody="Sign in first. Then add an OpenRouter key. Viewing the playground leaderboard stays open."
        signInTestId="playground-needs-login"
        keyTitle="Add an OpenRouter key to chat"
        keyBody="Paste your key below. Chats bill through your key."
        keyTestId="playground-needs-key"
        viewHref="/playground/leaderboard"
        viewLabel="View playground leaderboard"
      >
        <PlaygroundApp
          models={models}
          catalogEmpty={models.length === 0}
          initialSessionId={sp.session ?? null}
          recentSessions={recentSessions}
        />
      </ServiceAccessGate>
    </div>
  );
}
