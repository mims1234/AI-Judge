"use client";

import { Tabs } from "@/components/ui/Tabs";

/** Trial switcher above Answer when trials > 1 (plans/09 §2.4). */
export function TrialTabs({
  trialCount,
  activeTrial,
  onChange,
}: {
  trialCount: number;
  activeTrial: number;
  onChange: (trialIndex: number) => void;
}) {
  if (trialCount <= 1) return null;

  const tabs = Array.from({ length: trialCount }, (_, i) => ({
    key: String(i),
    label: `Trial ${i + 1}`,
  }));

  return (
    <Tabs
      tabs={tabs}
      activeKey={String(activeTrial)}
      onChange={(k) => onChange(Number(k))}
      ariaLabel="Trials"
      idBase="trial"
    />
  );
}
