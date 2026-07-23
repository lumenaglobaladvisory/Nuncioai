"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EmailThread } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";
import PlanReviewPanel, { type PlanView } from "./PlanReviewPanel";

interface TodayThread extends EmailThread {
  reason: string;
}

interface SyncResult {
  threadsSynced: number;
  threadsClassified: number;
  accountsSynced: number;
}

export default function DashboardClient({
  initialToday,
  pendingPlans,
  accountsCount,
  llmMode,
}: {
  initialToday: TodayThread[];
  pendingPlans: PlanView[];
  accountsCount: number;
  llmMode: "stub" | "claude";
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const result = await apiFetch<SyncResult>("/api/sync", { method: "POST" });
      setSyncResult(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Today</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            {accountsCount} mailbox{accountsCount === 1 ? "" : "es"} connected
            <Badge
              label={llmMode === "stub" ? "rule-based (no API key)" : "Claude"}
              tone={llmMode === "stub" ? "medium" : "low"}
            />
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync inbox"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {syncResult && (
        <p className="text-xs text-neutral-500">
          Synced {syncResult.threadsSynced} threads across {syncResult.accountsSynced} account(s), classified{" "}
          {syncResult.threadsClassified} new.
        </p>
      )}

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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Ordered by priority ({initialToday.length})</h2>
        {initialToday.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-400">
            Nothing needs your attention right now. Click &quot;Sync inbox&quot; to check for new mail.
          </p>
        )}
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {initialToday.map((thread) => (
            <li key={thread.id}>
              <Link
                href={`/threads/${thread.id}`}
                className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-neutral-900">{thread.subject}</p>
                    <Badge label={thread.category ?? "unclassified"} />
                    {thread.priority && <Badge label={thread.priority} />}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{thread.snippet}</p>
                  <p className="mt-1 text-xs text-neutral-400">{thread.reason}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">
                  {new Date(thread.lastMessageAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
