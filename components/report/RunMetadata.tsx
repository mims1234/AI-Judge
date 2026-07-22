import { CopyButton } from "@/components/ui/CopyButton";
import { shortId } from "@/lib/format";
import { CATEGORY_ORDER, type RunSnapshot } from "@/lib/schemas";

export type RunMetadataProps = {
  snapshot: RunSnapshot;
};

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function modelShort(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Seed, hash, panels, parameters — all mono/copyable (plans/10 §5.1). */
export function RunMetadata({ snapshot }: RunMetadataProps) {
  const { run, panels, judge_pool, candidates } = snapshot;
  const paramsJson = JSON.stringify(run.parameters ?? {}, null, 2);

  const substitutions = snapshot.task_results.flatMap((tr) =>
    tr.judgments
      .filter((j) => j.is_substitute)
      .map((j) => ({
        category: tr.category,
        judge: j.judge_model_id,
        candidate: tr.candidate_model_id,
      })),
  );

  return (
    <section aria-labelledby="metadata-heading" className="flex flex-col gap-3">
      <h2 id="metadata-heading" className="text-sm uppercase tracking-wide text-dim">
        Run metadata
      </h2>

      <dl className="grid gap-3 rounded-md border border-line-subtle bg-ink-900 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-dim">Run id</dt>
          <dd className="mt-0.5 flex items-center gap-2 font-mono text-sm text-bright">
            {run.id}
            <CopyButton text={run.id} label="run id" />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-dim">Seed</dt>
          <dd className="mt-0.5 flex items-center gap-2 font-mono text-sm text-bright">
            {run.seed}
            <CopyButton text={String(run.seed)} label="seed" />
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-dim">Bundle hash</dt>
          <dd className="mt-0.5 flex items-center gap-2 font-mono text-sm text-bright">
            <span className="truncate" title={run.bundle_hash}>
              {run.bundle_hash}
            </span>
            <CopyButton text={run.bundle_hash} label="bundle hash" />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-dim">Candidates</dt>
          <dd className="mt-0.5 font-mono text-sm text-body">
            {candidates.map(modelShort).join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-dim">Judge pool</dt>
          <dd className="mt-0.5 font-mono text-sm text-body">
            {judge_pool.map(modelShort).join(", ")}
          </dd>
        </div>
      </dl>

      <div className="rounded-md border border-line-subtle bg-ink-900 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-dim">
          Panels per category
        </h3>
        <ul className="space-y-2">
          {CATEGORY_ORDER.map((cat) => {
            const panel = panels.find((p) => p.category === cat);
            if (!panel) return null;
            const subs = substitutions.filter((s) => s.category === cat);
            return (
              <li key={cat} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-bright">{capitalize(cat)}</span>
                  <span className="font-mono text-[11px] text-faint">
                    seed {panel.panel_seed}
                  </span>
                </div>
                <p className="font-mono text-xs text-body">
                  panel: {panel.judges.map(modelShort).join(" · ") || "—"}
                </p>
                <p className="font-mono text-xs text-dim">
                  reserves: {panel.reserves.map(modelShort).join(" · ") || "—"}
                </p>
                {subs.length > 0 && (
                  <p className="mt-0.5 text-xs text-warn-400">
                    Substitutions:{" "}
                    {subs
                      .map(
                        (s) =>
                          `${modelShort(s.judge)} (reserve, for ${modelShort(s.candidate)})`,
                      )
                      .join("; ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-md border border-line-subtle bg-ink-900 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs uppercase tracking-wide text-dim">Parameters</h3>
          <CopyButton text={paramsJson} label="parameters JSON" />
        </div>
        <pre className="overflow-x-auto font-mono text-xs text-body">
          {paramsJson}
        </pre>
        <p className="mt-2 font-mono text-[11px] text-faint">
          bundle {shortId(run.bundle_id)} · status {run.status}
        </p>
      </div>
    </section>
  );
}
