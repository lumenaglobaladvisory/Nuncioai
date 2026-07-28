const COLORS: Record<string, string> = {
  // categories
  must_respond_today: "bg-red-100 text-red-800",
  review_this_week: "bg-amber-100 text-amber-800",
  fyi: "bg-blue-100 text-blue-700",
  noise: "bg-neutral-100 text-neutral-500",
  // legacy category values (pre-taxonomy-update threads, shown until re-synced)
  must_respond: "bg-red-100 text-red-800",
  needs_review: "bg-amber-100 text-amber-800",
  low_value: "bg-neutral-100 text-neutral-600",
  notification: "bg-neutral-100 text-neutral-500",
  newsletter: "bg-neutral-100 text-neutral-500",
  reference: "bg-blue-100 text-blue-700",
  // priority / risk
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-green-100 text-green-800",
  // plan status
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-700",
  executed: "bg-green-100 text-green-800",
  undone: "bg-neutral-200 text-neutral-700",
  rejected: "bg-neutral-200 text-neutral-500",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-neutral-100 text-neutral-400",
};

export default function Badge({ label, tone }: { label: string; tone?: string }) {
  const color = COLORS[tone ?? label] ?? "bg-neutral-100 text-neutral-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}
