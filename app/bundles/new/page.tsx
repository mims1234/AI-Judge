import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { pageSeo } from "@/lib/seo";
import { ServiceAccessGate } from "@/components/auth/ServiceAccessGate";
import { SignInGate } from "@/components/auth/SignInGate";
import type { PickerModel } from "@/components/models/ModelPicker";
import { PackWizard } from "@/components/packs/PackWizard";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildDemoCatalog } from "@/lib/mocks/catalog";
import {
  getCachedCatalog,
  getModelCatalog,
  hasServerKey,
} from "@/lib/openrouter";
import { getKeyStatusInfo } from "@/lib/server/appSettings";
import { loadPackImproveSeed } from "@/lib/server/customBundles";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Create pack",
  description:
    "Author a new immutable prompt pack with category tasks, judge prompts, and output schemas.",
  path: "/bundles/new",
  index: false,
});

function strip(
  models: Array<{
    id: string;
    name: string;
    context_length: number;
    pricing: { prompt_usd_per_m: number; completion_usd_per_m: number } | null;
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

type SearchParams = Promise<{ from?: string }>;

export default async function NewPackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getSessionUser();
  const { from } = await searchParams;
  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8 md:px-10">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
          Create pack
        </h1>
        <SignInGate
          testId="pack-needs-login"
          title="Sign in to create a pack"
          body="Sign in first. Then add an OpenRouter key to generate and publish. Viewing bundles stays open."
        />
        <p className="mt-6 text-center">
          <Link href="/bundles" className={buttonClasses({ variant: "secondary" })}>
            View bundles
          </Link>
        </p>
      </div>
    );
  }

  const catalog = hasServerKey()
    ? await getModelCatalog().catch(() => getCachedCatalog())
    : getCachedCatalog();
  const models = catalog
    ? strip(catalog.models)
    : strip(buildDemoCatalog());
  const keyStatus = getKeyStatusInfo();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8 md:px-10">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
        Create pack
      </h1>
      <p className="mt-2 text-sm text-dim">
        A custom pack is 1–5 prompts — same type is allowed. Use General or
        Other when the eight official types do not fit. Generated with your
        key, then published to its own board.
      </p>
      <div className="mt-8">
        <ServiceAccessGate
          embed
          serverConfigured={keyStatus.serverConfigured}
          heading="Create pack"
          noticeKind="pack"
          signInTitle="Sign in to create a pack"
          signInBody="Sign in first. Then add an OpenRouter key to generate and publish."
          signInTestId="pack-needs-login"
          keyTitle="Add an OpenRouter key to create a pack"
          keyBody="Paste your key below. Generation bills through your key. Viewing bundles stays open."
          keyTestId="pack-needs-key"
          viewHref="/bundles"
          viewLabel="View bundles"
        >
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <PackWizard
              models={models}
              serverConfigured={keyStatus.serverConfigured}
              seed={from ? loadPackImproveSeed(from, user.id) : null}
            />
          </Suspense>
        </ServiceAccessGate>
      </div>
    </div>
  );
}
