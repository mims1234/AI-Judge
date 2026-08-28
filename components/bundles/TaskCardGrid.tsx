"use client";

import { useState } from "react";
import { TaskCard, type TaskCardData } from "@/components/bundles/TaskCard";
import { labeledTaskTitles } from "@/lib/bundles/task-labels";

/** 2×4 task card grid holding which card is expanded (plans/08 §3.2). */
export function TaskCardGrid({ tasks }: { tasks: TaskCardData[] }) {
  const labeled = labeledTaskTitles(tasks);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {labeled.map((task, idx) => {
        const cardKey = `${task.category}-${idx}`;
        return (
          <TaskCard
            key={cardKey}
            task={{ ...task, title: task.title, cardKey }}
            expanded={expandedKey === cardKey}
            onToggle={() =>
              setExpandedKey((cur) => (cur === cardKey ? null : cardKey))
            }
          />
        );
      })}
    </div>
  );
}
