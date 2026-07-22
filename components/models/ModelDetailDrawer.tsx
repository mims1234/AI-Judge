"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { Drawer } from "@/components/ui/Drawer";
import { formatContext, formatUsd } from "@/lib/format";
import { ModelPicker, type PickerModel } from "@/components/models/ModelPicker";

export type ModelExtras = {
  description: string | null;
  supportedParameters: string[];
};

/**
 * Model detail sheet driven by ?model=<id> — linkable; the back button closes
 * it (plans/08 §2.3). Opening pushes a history entry; close goes back.
 */
export function ModelDetailDrawer({
  model,
  extras,
}: {
  model: PickerModel | null;
  extras: ModelExtras | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(pathname, { scroll: false });
    }
  };

  return (
    <Drawer
      open={model != null}
      onClose={close}
      testId="model-detail-drawer"
      title={
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-base text-bright">{model?.name ?? "Model"}</span>
          <span className="flex items-center gap-1 font-mono text-xs text-dim">
            <span className="truncate">{model?.id}</span>
            {model && <CopyButton text={model.id} label="model id" />}
          </span>
        </div>
      }
    >
      {model && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{formatContext(model.context_length)}</Badge>
            {model.is_free && <Badge tone="teal">FREE</Badge>}
            {model.supports_structured_outputs && <Badge>structured outputs</Badge>}
          </div>

          {extras?.description && (
            <section>
              <h3 className="mb-1.5 text-xs uppercase tracking-wide text-dim">Description</h3>
              <p className="text-sm leading-6 text-body">{extras.description}</p>
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-xs uppercase tracking-wide text-dim">Pricing</h3>
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="border-b border-line-subtle">
                  <td className="py-2 text-dim">Prompt</td>
                  <td className="py-2 text-right font-mono tabular-nums text-body">
                    {model.pricing ? `${formatUsd(model.pricing.prompt_usd_per_m)}/M` : "—"}
                  </td>
                </tr>
                <tr className="border-b border-line-subtle">
                  <td className="py-2 text-dim">Completion</td>
                  <td className="py-2 text-right font-mono tabular-nums text-body">
                    {model.pricing ? `${formatUsd(model.pricing.completion_usd_per_m)}/M` : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-dim">Context length</td>
                  <td className="py-2 text-right font-mono tabular-nums text-body">
                    {model.context_length.toLocaleString()} tokens
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {extras && extras.supportedParameters.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs uppercase tracking-wide text-dim">
                Supported parameters
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {extras.supportedParameters.map((p) => (
                  <Badge key={p}>{p}</Badge>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-2 border-t border-line-subtle pt-4 sm:flex-row">
            <Link
              href={`/run?candidates=${encodeURIComponent(model.id)}`}
              className={buttonClasses({ variant: "primary", className: "flex-1" })}
            >
              Use as candidate
            </Link>
            <Link
              href={`/run?judges=${encodeURIComponent(model.id)}`}
              className={buttonClasses({ variant: "secondary", className: "flex-1" })}
            >
              Use as judge
            </Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/**
 * Page wiring: picker + URL-driven drawer (plans/08 §2.3). The server page
 * resolves the selected model + extras; row clicks push ?model= entries.
 */
export function ModelsClient({
  models,
  selectedModel,
  selectedExtras,
}: {
  models: PickerModel[];
  selectedModel: PickerModel | null;
  selectedExtras: ModelExtras | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <>
      <ModelPicker
        variant="page"
        models={models}
        onOpenDetail={(id) =>
          router.push(`${pathname}?model=${encodeURIComponent(id)}`, { scroll: false })
        }
        className="mt-4"
      />
      <ModelDetailDrawer model={selectedModel} extras={selectedExtras} />
    </>
  );
}
