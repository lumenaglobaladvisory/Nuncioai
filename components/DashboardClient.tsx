"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlarmClock, CalendarCheck, Inbox, RefreshCw, Sparkles } from "lucide-react";
import type { EmailThread } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import type { WeeklyDigest as WeeklyDigestData, WeeklyImpact } from "@/lib/stats";
import Badge from "./Badge";
import Button from "./Button";
import CategorySelect from "./CategorySelect";
import PlanReviewPanel, { type PlanView } from "./PlanReviewPanel";
import ImpactBanner from "./ImpactBanner";
import WeeklyDigest from "./WeeklyDigest";

interface TodayThread extends EmailThread {
  reason: string;
}

interface SyncResult {
  threadsSynced: number;
  threadsClassified: number;
  accountsSynced: number;
}

function ThreadCard({
  thread,
  accent,
  onRecategorized,
}: {
  thread: TodayThread;
  accent: "red" | "amber";
  onRecategorized: () => void;
}) {
  const accentClass = accent === "red" ? "border-l-red-400" : "border-l-amber-400";
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-xl border border-l-4 ${accentClass} border-neutral-200 bg-white px-4 py-3.5 shadow-sm shadow-neutral-100 transition-shadow hover:shadow-md hover:shadow-neutral-200`}
    >
      <Link href={`/threads/${thread.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-neutral-900">{thread.subject}</p>
          {thread.priority && <Badge label={thread.priority} />}
        </div>
        <p className="mt-0.5 truncate text-xs text-neutral-500">{thread.snippet}</p>
        <p className="mt-1 text-xs text-neutral-400">{thread.reason}</p>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-neutral-400">{new Date(thread.lastMessageAt).toLocaleDateString()}</span>
        <CategorySelect threadId={thread.id} category={thread.category} onChanged={onRecategorized} />
      </div>
    </div>
  );
}

export default function DashboardClient({
  initialToday,
  pendingPlans,
  accountsCount,
  llmMode,
  impact,
  digest,
}: {
  initialToday: TodayThread[];
  pendingPlans: PlanView[];
  accountsCount: number;
  llmMode: "stub" | "claude";
  impact: WeeklyImpact;
  digest: WeeklyDigestData;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [retriaging, setRetriaging] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSync(force: boolean) {
    (force ? setRetriaging : setSyncing)(true);
    setError(null);
    try {
      const result = await apiFetch<SyncResult>("/api/sync", { method: "POST", body: JSON.stringify({ force }) });
      setSyncResult(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      (force ? setRetriaging : setSyncing)(false);
    }
  }

  const handleSync = () => runSync(false);
  const handleRetriage = () => runSync(true);

  const mustRespondToday = initialToday.filter((t) => t.category === "must_respond_today");
  const reviewThisWeek = initialToday.filter((t) => t.category !== "must_respond_today");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Today</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            {accountsCount} mailbox{accountsCount === 1 ? "" : "es"} connected
            <Badge
              label={llmMode === "stub" ? "rule-based (no API key)" : "Claude"}
              tone={llmMode === "stub" ? "medium" : "low"}
            />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleRetriage} disabled={syncing || retriaging}>
            <Sparkles className={`h-3.5 w-3.5 ${retriaging ? "animate-pulse" : ""}`} strokeWidth={2.25} />
            {retriaging ? "Re-triaging..." : "Re-triage inbox"}
          </Button>
          <Button onClick={handleSync} disabled={syncing || retriaging}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} strokeWidth={2.25} />
            {syncing ? "Syncing..." : "Sync inbox"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {syncResult && (
        <p className="text-xs text-neutral-500">
          Synced {syncResult.threadsSynced} threads across {syncResult.accountsSynced} account(s), (re)classified{" "}
          {syncResult.threadsClassified}.
        </p>
      )}

      <ImpactBanner impact={impact} />

      {pendingPlans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">Awaiting your approval ({pendingPlans.length})</h2>
          <div className="space-y-3">
            {pendingPlans.map((plan) => (
              <PlanReviewPanel key={plan.id} plan={plan} />
            ))}
          </div>
        </section>
      )}

      {initialToday.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-12 text-center">
          <Inbox className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
          <p className="text-sm text-neutral-400">
            Nothing needs your attention right now. Click &quot;Sync inbox&quot; to check for new mail.
          </p>
        </div>
      )}

      {(mustRespondToday.length > 0 || reviewThisWeek.length > 0) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
              <AlarmClock className="h-3.5 w-3.5" strokeWidth={2.25} />
              Must respond today ({mustRespondToday.length})
            </h2>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {mustRespondToday.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-xs text-neutral-400">
                  Nothing urgent right now.
                </p>
              ) : (
                mustRespondToday.map((thread) => (
                  <ThreadCard key={thread.id} thread={thread} accent="red" onRecategorized={() => router.refresh()} />
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
              Review this week ({reviewThisWeek.length})
            </h2>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {reviewThisWeek.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-xs text-neutral-400">
                  Nothing to review this week.
                </p>
              ) : (
                reviewThisWeek.map((thread) => (
                  <ThreadCard key={thread.id} thread={thread} accent="amber" onRecategorized={() => router.refresh()} />
                ))
              )}
            </div>
          </section>
        </div>
      )}

      <WeeklyDigest digest={digest} />
    </div>
  );
}
