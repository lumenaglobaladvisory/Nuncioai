"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";

export interface PlanActionView {
  id: string;
  tool: string;
  threadId: string | null;
  payload: string;
  status: string;
  riskLevel: string;
  reversible: boolean;
  errorMessage: string | null;
  thread?: { subject: string } | null;
}

export interface PlanView {
  id: string;
  kind: string;
  summary: string;
  planJson: string;
  status: string;
  riskLevel: string;
  createdAt: string | Date;
  actions: PlanActionView[];
}

function describeAction(action: PlanActionView): string {
  const payload = JSON.parse(action.payload) as Record<string, unknown>;
  const subject = action.thread?.subject ? `"${action.thread.subject}"` : "";
  switch (action.tool) {
    case "send_email":
      return `Send email ${subject} to ${(payload.to as string[])?.join(", ")}`;
    case "save_draft":
      return `Save draft reply ${subject}`;
    case "archive_emails":
      return `Archive ${subject}`;
    case "label_emails":
      return `Label ${subject}: +${((payload.addLabels as string[]) ?? []).join(",") || "none"} -${((payload.removeLabels as string[]) ?? []).join(",") || "none"}`;
    case "snooze_emails":
      return `Snooze ${subject} until ${payload.until}`;
    case "create_task":
      return `Create task: ${payload.title}`;
    case "create_event":
      return `Create calendar event: ${payload.title} (${payload.startTime} - ${payload.endTime})`;
    default:
      return action.tool;
  }
}

export default function PlanReviewPanel({ plan }: { plan: PlanView }) {
  const router = useRouter();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const toggleSkip = (id: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const approveAndRun = () =>
    run(async () => {
      await apiFetch(`/api/plans/${plan.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ skipActionIds: Array.from(skipped) }),
      });
      await apiFetch(`/api/plans/${plan.id}/execute`, { method: "POST" });
    });

  const reject = () => run(() => apiFetch(`/api/plans/${plan.id}`, { method: "DELETE" }));
  const undoAll = () => run(() => apiFetch(`/api/plans/${plan.id}/undo`, { method: "POST" }));
  const undoOne = (actionId: string) =>
    run(() => apiFetch(`/api/plans/${plan.id}/actions/${actionId}/undo`, { method: "POST" }));

  const hasUndoableAction = plan.actions.some((a) => a.reversible && a.status === "executed");

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">{plan.summary}</p>
          <p className="mt-0.5 text-xs text-neutral-400">{plan.kind}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge label={plan.riskLevel} />
          <Badge label={plan.status} />
        </div>
      </div>

      <ul className="mb-3 space-y-1.5">
        {plan.actions.map((action) => (
          <li key={action.id} className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-2.5 py-1.5 text-sm">
            <div className="flex items-center gap-2">
              {plan.status === "pending" && (
                <input
                  type="checkbox"
                  checked={!skipped.has(action.id)}
                  onChange={() => toggleSkip(action.id)}
                  className="h-3.5 w-3.5"
                  aria-label="Include this action"
                />
              )}
              <span className={skipped.has(action.id) ? "text-neutral-400 line-through" : "text-neutral-700"}>
                {describeAction(action)}
              </span>
              {action.riskLevel === "high" && <Badge label="high risk" tone="high" />}
            </div>
            <div className="flex items-center gap-2">
              {plan.status !== "pending" && <Badge label={action.status} />}
              {action.reversible && action.status === "executed" && (
                <button
                  onClick={() => undoOne(action.id)}
                  disabled={busy}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  Undo
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {plan.actions.some((a) => a.status === "failed") && (
        <p className="mb-2 text-xs text-red-600">
          Some actions failed: {plan.actions.filter((a) => a.status === "failed").map((a) => a.errorMessage).join("; ")}
        </p>
      )}
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <button onClick={() => setShowJson((s) => !s)} className="text-xs text-neutral-400 hover:text-neutral-600">
          {showJson ? "Hide" : "Show"} PLAN_JSON
        </button>
        <div className="flex gap-2">
          {plan.status === "pending" && (
            <>
              <button
                onClick={reject}
                disabled={busy}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={approveAndRun}
                disabled={busy}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Approve &amp; Run
              </button>
            </>
          )}
          {plan.status === "executed" && hasUndoableAction && (
            <button
              onClick={undoAll}
              disabled={busy}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Undo all
            </button>
          )}
        </div>
      </div>

      {showJson && (
        <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
          {JSON.stringify(JSON.parse(plan.planJson), null, 2)}
        </pre>
      )}
    </div>
  );
}
