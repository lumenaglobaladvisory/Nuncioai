import { Clock, FilterX, Repeat, ClipboardList } from "lucide-react";
import type { WeeklyImpact } from "@/lib/stats";

const STATS: {
  key: keyof WeeklyImpact;
  label: string;
  icon: typeof Clock;
}[] = [
  { key: "noiseFiltered", label: "auto-filed as noise", icon: FilterX },
  { key: "followupsSent", label: "follow-ups sent for you", icon: Repeat },
  { key: "tasksAndEventsExtracted", label: "tasks/events extracted", icon: ClipboardList },
];

export default function ImpactBanner({ impact }: { impact: WeeklyImpact }) {
  if (impact.threadsTriaged === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Clock className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <p className="text-sm">
          <span className="font-semibold text-neutral-900">~{impact.minutesSaved} min saved</span>
          <span className="text-neutral-500"> this week</span>
        </p>
      </div>
      <div className="hidden h-6 w-px bg-indigo-200 sm:block" />
      {STATS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="flex items-center gap-1.5 text-xs text-neutral-600">
          <Icon className="h-3.5 w-3.5 text-indigo-400" strokeWidth={2} />
          <span className="font-medium text-neutral-900">{impact[key]}</span>
          {label}
        </div>
      ))}
    </div>
  );
}
