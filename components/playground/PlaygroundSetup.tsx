"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PickerModel } from "@/components/models/ModelPicker";
import { ModelPicker } from "@/components/models/ModelPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { RecentSessions } from "@/components/playground/RecentSessions";
import { CHAT_LIMITS } from "@/lib/schemas";
import type { RecentChatSession } from "@/lib/server/chatAnalytics";

/** Setup panel — pick one candidate + 3–5 judges (structured outputs preferred). */
export function PlaygroundSetup({
  models,
  catalogEmpty,
  busy,
  error,
  recentSessions = [],
  onStart,
}: {
  models: PickerModel[];
  catalogEmpty: boolean;
  busy: boolean;
  error: string | null;
  recentSessions?: RecentChatSession[];
  onStart: (candidateId: string, judgeIds: string[]) => void;
}) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [judgeIds, setJudgeIds] = useState<string[]>([]);
  const [picker, setPicker] = useState<"candidate" | "judges" | null>(null);

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const candidate = candidateId ? byId.get(candidateId) : null;
  const judges = judgeIds
    .map((id) => byId.get(id))
    .filter((m): m is PickerModel => !!m);
  const unstructuredJudgeCount = judges.filter(
    (j) => !j.supports_structured_outputs,
  ).length;

  const selfJudging =
    !!candidateId && judgeIds.includes(candidateId);
  const canStart =
    !!candidateId &&
    judgeIds.length >= CHAT_LIMITS.MIN_JUDGES &&
    judgeIds.length <= CHAT_LIMITS.MAX_JUDGES &&
    !selfJudging &&
    !busy;

  if (catalogEmpty) {
    return (
      <EmptyState
        title="Model catalog is empty."
        body="Refresh the catalog from Settings before starting a chat."
        action={
          <Link
            href="/settings"
            className="rounded-md bg-teal-500 px-3 py-2 text-sm text-ink-950"
          >
            Open settings
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl text-bright">New session</h2>
        <p className="mt-1 text-sm text-dim">
          Chat freely with one candidate, then run {CHAT_LIMITS.MIN_JUDGES}–
          {CHAT_LIMITS.MAX_JUDGES} judges. Category locks after the first
          judging round.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-bright">Candidate</h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPicker("candidate")}
          >
            {candidate ? "Change" : "Pick model"}
          </Button>
        </div>
        {candidate ? (
          <div className="rounded-md border border-line-subtle bg-ink-900 px-3 py-2 font-mono text-sm text-body">
            {candidate.id}
          </div>
        ) : (
          <p className="text-sm text-dim">No candidate selected.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-bright">
            Judges{" "}
            <span className="font-normal text-dim">
              ({judgeIds.length}/{CHAT_LIMITS.MAX_JUDGES})
            </span>
          </h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPicker("judges")}
          >
            {judges.length ? "Edit pool" : "Pick judges"}
          </Button>
        </div>
        {judges.length === 0 ? (
          <p className="text-sm text-dim">
            Choose {CHAT_LIMITS.MIN_JUDGES}–{CHAT_LIMITS.MAX_JUDGES} models.
            Structured outputs preferred; others use the JSON repair path.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {judges.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-ink-900 px-3 py-2"
              >
                <span className="truncate font-mono text-xs text-body">
                  {j.id}
                </span>
                {j.supports_structured_outputs ? (
                  <Badge tone="teal" title="Advertises structured outputs">
                    structured
                  </Badge>
                ) : (
                  <Badge
                    tone="warn"
                    title="No structured outputs — schema-retry path will be used"
                  >
                    prompt JSON
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {unstructuredJudgeCount > 0 && (
        <p className="rounded-md border border-warn-400/30 bg-ink-900 px-3 py-2 text-sm text-warn-400">
          {unstructuredJudgeCount === 1
            ? "1 judge does not advertise structured outputs"
            : `${unstructuredJudgeCount} judges do not advertise structured outputs`}
          ; judging still works via the schema-retry path.
        </p>
      )}

      {selfJudging && (
        <p className="rounded-md border border-warn-400/30 bg-ink-900 px-3 py-2 text-sm text-warn-400">
          Candidate cannot also be a judge — remove it from the judge pool.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-fail-400/30 bg-fail-900 px-3 py-2 text-sm text-fail-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canStart}
          loading={busy}
          onClick={() => {
            if (!candidateId) return;
            onStart(candidateId, judgeIds);
          }}
        >
          Start chat
        </Button>
        <Link
          href="/playground/leaderboard"
          className="text-sm text-teal-300 hover:text-teal-200"
        >
          Chat leaderboard →
        </Link>
      </div>

      <RecentSessions sessions={recentSessions} />

      <Modal
        open={picker != null}
        onClose={() => setPicker(null)}
        title={picker === "candidate" ? "Pick candidate" : "Pick judges"}
        wide
      >
        {picker === "candidate" && (
          <ModelPicker
            variant="palette"
            models={models}
            selectedIds={candidateId ? [candidateId] : []}
            maxSelection={1}
            onToggle={(id) => {
              setCandidateId(id);
              // Backup: drop candidate from judges if it was already selected.
              setJudgeIds((prev) => prev.filter((x) => x !== id));
              setPicker(null);
            }}
            autoFocusSearch
          />
        )}
        {picker === "judges" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-dim">
              Select {CHAT_LIMITS.MIN_JUDGES}–{CHAT_LIMITS.MAX_JUDGES} models.
              The candidate cannot also be a judge. Models without structured
              outputs are allowed (schema-retry path).
            </p>
            <ModelPicker
              variant="palette"
              models={models.filter((m) => m.id !== candidateId)}
              selectedIds={judgeIds}
              maxSelection={CHAT_LIMITS.MAX_JUDGES}
              onToggle={(id) => {
                if (id === candidateId) return;
                setJudgeIds((prev) =>
                  prev.includes(id)
                    ? prev.filter((x) => x !== id)
                    : prev.length < CHAT_LIMITS.MAX_JUDGES
                      ? [...prev, id]
                      : prev,
                );
              }}
              autoFocusSearch
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setPicker(null)}
                disabled={judgeIds.length < CHAT_LIMITS.MIN_JUDGES}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
