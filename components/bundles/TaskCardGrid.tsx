"use client";

import { useState } from "react";
import { TaskCard, type TaskCardData } from "@/components/bundles/TaskCard";

/** 2×4 task card grid holding which card is expanded (plans/08 §3.2). */
export function TaskCardGrid({ tasks }: { tasks: TaskCardData[] }) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tasks.map((task) => (
        <TaskCard
          key={task.category}
          task={task}
          expanded={expandedCategory === task.category}
          onToggle={() =>
            setExpandedCategory((cur) => (cur === task.category ? null : task.category))
          }
        />
      ))}
    </div>
  );
}
