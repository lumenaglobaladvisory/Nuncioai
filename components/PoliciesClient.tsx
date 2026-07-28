"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Repeat, Archive, CalendarClock, Check, Sparkles } from "lucide-react";
import type { Policy } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";
import Button from "./Button";
import { POLICY_TEMPLATES, type PolicyTemplate } from "@/lib/policy-templates";

const TRIGGER_TYPES = ["no_reply", "before_meeting", "schedule", "label_added"] as const;
const ACTIONS = ["draft_followup", "summarize_and_archive", "send_reminder"] as const;

const TRIGGER_HELP: Record<string, string> = {
  no_reply: 'Fires when a thread you sent the last message on has had no reply for "Time delay" (e.g. 3d).',
  before_meeting: "Reminds you ahead of upcoming meetings (uses calendar events created by InboxPilot).",
  schedule: 'Runs on a recurring interval set by "Time delay" (e.g. 7d for weekly).',
  label_added: 'Fires for any thread matching "Scope" (e.g. emails_labeled:proposals).',
};

const CATEGORY_ICON: Record<PolicyTemplate["category"], typeof Repeat> = {
  followup: Repeat,
  cleanup: Archive,
  reminders: CalendarClock,
};

function RecommendedPolicyCard({
  template,
  added,
  busy,
  onAdd,
}: {
  template: PolicyTemplate;
  added: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  const Icon = CATEGORY_ICON[template.category];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-100">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900">{template.title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{template.description}</p>
      </div>
      {added ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <Check className="h-3 w-3" strokeWidth={2.5} />
          Added
        </span>
      ) : (
        <Button size="sm" onClick={onAdd} disabled={busy} className="shrink-0">
          Add
        </Button>
      )}
    </div>
  );
}

export default function PoliciesClient({ initialPolicies }: { initialPolicies: Policy[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<(typeof TRIGGER_TYPES)[number]>("no_reply");
  const [timeDelay, setTimeDelay] = useState("3d");
  const [scope, setScope] = useState("");
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("draft_followup");
  const [tone, setTone] = useState("polite_firm");
  const [creating, setCreating] = useState(false);

  const addedTemplateKeys = new Set(initialPolicies.map((p) => p.templateKey).filter((k): k is string => Boolean(k)));

  async function addFromTemplate(templateKey: string) {
    setBusy(templateKey);
    setError(null);
    try {
      await apiFetch("/api/policies/from-template", { method: "POST", body: JSON.stringify({ templateKey }) });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add policy");
    } finally {
      setBusy(null);
    }
  }

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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Policies</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Automate follow-ups and cleanup. Every run still produces a plan you approve before anything sends -
          policies never send email on their own.
        </p>
      </div>

      {error && <p className="text-sm text-neutral-700">{error}</p>}

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" strokeWidth={2.25} />
          Recommended policies
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {POLICY_TEMPLATES.map((template) => (
            <RecommendedPolicyCard
              key={template.key}
              template={template}
              added={addedTemplateKeys.has(template.key)}
              busy={busy === template.key}
              onAdd={() => addFromTemplate(template.key)}
            />
          ))}
        </div>
      </section>

      <details className="group" open={showCustomForm} onToggle={(e) => setShowCustomForm(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          {showCustomForm ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Create a custom policy
        </summary>
        <form onSubmit={createPolicy} className="mt-3 space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-100">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-500">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Follow up on proposals"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Trigger</label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as (typeof TRIGGER_TYPES)[number])}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
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
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Scope (optional)</label>
              <input
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder="emails_labeled:proposals or category:noise"
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as (typeof ACTIONS)[number])}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
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
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-400">{TRIGGER_HELP[triggerType]}</p>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create policy"}
          </Button>
        </form>
      </details>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Your policies</h2>
        {initialPolicies.length === 0 && <p className="text-sm text-neutral-400">No policies yet - add one above.</p>}
        <div className="space-y-2">
          {initialPolicies.map((policy) => (
            <div key={policy.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-100">
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
                  <Button variant="secondary" size="sm" onClick={() => toggleEnabled(policy)} disabled={busy === policy.id}>
                    {policy.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => runNow(policy)}
                    disabled={busy === policy.id || !policy.enabled}
                  >
                    Run now
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(policy)} disabled={busy === policy.id}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
