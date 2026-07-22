"use client";

import { cn } from "@/lib/cn";
import { CATEGORY_SUMMARIES, validatorLabel, validatorsForCategory } from "@/lib/validatorLabels";
import type { Category } from "@/lib/schemas";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { Tabs } from "@/components/ui/Tabs";
import { useState } from "react";

export type TaskCardData = {
  category: Category;
  task_body: string;
  output_schema: string; // JSON string
  token_limit: number;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** One category task card; expands in place to Prompt / Schema / Validators tabs. */
export function TaskCard({
  task,
  expanded,
  onToggle,
}: {
  task: TaskCardData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [tab, setTab] = useState("prompt");
  const validators = validatorsForCategory(task.category);
  const idBase = `task-${task.category}`;

  return (
    <article
      className={cn(
        "flex flex-col rounded-md border border-line-subtle bg-ink-900 transition-colors duration-150",
        expanded ? "border-line-strong sm:col-span-2 lg:col-span-4" : "hover:border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${idBase}-detail`}
        className="flex flex-1 flex-col p-5 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base text-bright">{capitalize(task.category)}</h3>
          <span
            aria-hidden="true"
            className={cn("text-dim transition-transform duration-150", expanded && "rotate-90")}
          >
            ▸
          </span>
        </div>
        <p className="mt-1 text-sm leading-6 text-dim">{CATEGORY_SUMMARIES[task.category]}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge title="Max output tokens">{task.token_limit.toLocaleString()} tok</Badge>
          {validators.slice(0, 3).map((v) => (
            <Badge key={v} title={validatorLabel(v)}>
              {validatorLabel(v).split(" ").slice(0, 2).join(" ").toLowerCase()}
            </Badge>
          ))}
          {validators.length > 3 && <Badge>+{validators.length - 3} checks</Badge>}
        </div>
        <span className="mt-3 text-xs text-teal-400">
          {expanded ? "Hide task ▾" : "View task ▸"}
        </span>
      </button>

      {expanded && (
        <div id={`${idBase}-detail`} className="border-t border-line-subtle p-5">
          <Tabs
            tabs={[
              { key: "prompt", label: "Prompt" },
              { key: "schema", label: "Output schema" },
              { key: "validators", label: "Validators" },
            ]}
            activeKey={tab}
            onChange={setTab}
            ariaLabel={`${capitalize(task.category)} task details`}
            idBase={idBase}
          />

          {tab === "prompt" && (
            <div className="relative mt-4">
              <div className="absolute right-2 top-2">
                <CopyButton text={task.task_body} label={`${task.category} prompt`} />
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line-subtle bg-ink-950 p-4 pr-12 font-mono text-sm leading-6 text-body">
                {task.task_body}
              </pre>
            </div>
          )}

          {tab === "schema" && (
            <div className="relative mt-4">
              <div className="absolute right-2 top-2">
                <CopyButton text={prettyJson(task.output_schema)} label={`${task.category} schema`} />
              </div>
              <pre className="max-h-96 overflow-auto rounded-md border border-line-subtle bg-ink-950 p-4 pr-12 font-mono text-sm leading-6 text-body">
                {prettyJson(task.output_schema)}
              </pre>
            </div>
          )}

          {tab === "validators" && (
            <ul role="list" className="mt-4 flex flex-col gap-2">
              {validators.map((v) => (
                <li
                  key={v}
                  className="flex items-start gap-2.5 rounded-md border border-line-subtle bg-ink-950 px-3 py-2"
                >
                  <span aria-hidden="true" className="mt-0.5 text-teal-400">
                    ✓
                  </span>
                  <div>
                    <div className="text-sm text-body">{validatorLabel(v)}</div>
                    <div className="font-mono text-xs text-faint">{v}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
