"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Policy } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";

const TRIGGER_TYPES = ["no_reply", "before_meeting", "schedule", "label_added"] as const;
const ACTIONS = ["draft_followup", "summarize_and_archive", "send_reminder"] as const;

const TRIGGER_HELP: Record<string, string> = {
  no_reply: 'Fires when a thread you sent the last message on has had no reply for "Time delay" (e.g. 3d).',
  before_meeting: "Reminds you ahead of upcoming meetings (uses calendar events created by InboxPilot).",
  schedule: 'Runs on a recurring interval set by "Time delay" (e.g. 7d for weekly).',
  label_added: 'Fires for any thread matching "Scope" (e.g. emails_labeled:proposals).',
};

export default function PoliciesClient({ initialPolicies }: { initialPolicies: Policy[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<(typeof TRIGGER_TYPES)[number]>("no_reply");
  const [timeDelay, setTimeDelay] = useState("3d");
  const [scope, setScope] = useState("");
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("draft_followup");
  const [tone, setTone] = useState("polite_firm");
  const [creating, setCreating] = useState(false);

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiFetch("/api/policies", {
        method: "POST",
        body: JSON.stringify({ name, triggerType, timeDelay: timeDelay || undefined, scope: scope || undefined, action, tone }),
      });
      setName("");
      setScope("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create policy");
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(policy: Policy) {
    setBusy(policy.id);
    try {
      await apiFetch(`/api/policies/${policy.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !policy.enabled }) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runNow(policy: Policy) {
    setBusy(policy.id);
    setError(null);
    try {
      const result = await apiFetch<{ matched: number; planId: string | null }>(`/api/policies/${policy.id}/run`, {
        method: "POST",
      });
      setError(
        result.planId
          ? `Matched ${result.matched} thread(s) - review the new plan on the Dashboard.`
          : `Matched 0 threads - nothing to do right now.`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(policy: Policy) {
    setBusy(policy.id);
    try {
      await apiFetch(`/api/policies/${policy.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Policies</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Automate follow-ups and cleanup. Every run still produces a plan you approve before anything sends -
          policies never send email on their own.
        </p>
      </div>

      {error && <p className="text-sm text-neutral-700">{error}</p>}

      <form onSubmit={createPolicy} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-700">New policy</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Follow up on proposals"
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as (typeof TRIGGER_TYPES)[number])}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Time delay (e.g. 3d, 24h)</label>
            <input
              value={timeDelay}
              onChange={(e) => setTimeDelay(e.target.value)}
              placeholder="3d"
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Scope (optional)</label>
            <input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="emails_labeled:proposals or category:newsletter"
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as (typeof ACTIONS)[number])}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500">Tone</label>
            <input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="polite_firm"
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-neutral-400">{TRIGGER_HELP[triggerType]}</p>
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create policy"}
        </button>
      </form>

      <div className="space-y-3">
        {initialPolicies.length === 0 && <p className="text-sm text-neutral-400">No policies yet.</p>}
        {initialPolicies.map((policy) => (
          <div key={policy.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">{policy.name}</p>
                <p className="text-xs text-neutral-500">
                  {policy.triggerType} → {policy.action}
                  {policy.timeDelay ? ` · ${policy.timeDelay}` : ""}
                  {policy.scope ? ` · scope: ${policy.scope}` : ""}
                </p>
                {policy.lastRunAt && (
                  <p className="text-xs text-neutral-400">Last run: {new Date(policy.lastRunAt).toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge label={policy.enabled ? "enabled" : "disabled"} tone={policy.enabled ? "low" : "skipped"} />
                <button
                  onClick={() => toggleEnabled(policy)}
                  disabled={busy === policy.id}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                >
                  {policy.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => runNow(policy)}
                  disabled={busy === policy.id || !policy.enabled}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                >
                  Run now
                </button>
                <button
                  onClick={() => remove(policy)}
                  disabled={busy === policy.id}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
