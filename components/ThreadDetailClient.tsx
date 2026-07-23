"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft, EmailMessage, EmailThread } from "@prisma/client";
import { apiFetch } from "@/lib/api-client";
import Badge from "./Badge";
import PlanReviewPanel, { type PlanView } from "./PlanReviewPanel";

type ThreadWithRelations = EmailThread & {
  messages: EmailMessage[];
  drafts: Draft[];
  connectedAccount: { provider: string; email: string };
};

interface DraftResult {
  subject: string;
  bodyText: string;
}

interface ExtractedTask {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
}

interface ExtractedEvent {
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
}

interface ExtractionResult {
  tasks: ExtractedTask[];
  events: ExtractedEvent[];
}

const TONES = ["concise, professional, friendly", "more formal", "extra warm", "very firm"];

export default function ThreadDetailClient({ thread, plans }: { thread: ThreadWithRelations; plans: PlanView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inboundSenders = useMemo(
    () => Array.from(new Set(thread.messages.filter((m) => m.direction === "inbound").map((m) => m.fromEmail))),
    [thread.messages]
  );

  // --- Draft reply ---
  const [tone, setTone] = useState(TONES[0]);
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  async function generateDraft() {
    setGeneratingDraft(true);
    setError(null);
    try {
      const result = await apiFetch<DraftResult>(`/api/threads/${thread.id}/draft`, {
        method: "POST",
        body: JSON.stringify({ tone, instructions: instructions || undefined }),
      });
      setDraft(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft generation failed");
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function proposeDraft(kind: "save_draft" | "send_email") {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          kind: kind === "send_email" ? "send_reply" : "draft_reply",
          summary:
            kind === "send_email"
              ? `Send reply to "${thread.subject}"`
              : `Save draft reply for "${thread.subject}"`,
          actions: [
            {
              tool: kind,
              threadId: thread.id,
              payload: { to: inboundSenders, subject: draft.subject, bodyText: draft.bodyText, tone },
            },
          ],
        }),
      });
      setDraft(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setBusy(false);
    }
  }

  // --- Summarize ---
  const [summarizing, setSummarizing] = useState(false);
  async function summarize() {
    setSummarizing(true);
    setError(null);
    try {
      await apiFetch(`/api/threads/${thread.id}/summarize`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarize failed");
    } finally {
      setSummarizing(false);
    }
  }

  // --- Extract tasks/events ---
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());

  async function extract() {
    setExtracting(true);
    setError(null);
    try {
      const result = await apiFetch<ExtractionResult>(`/api/threads/${thread.id}/extract`, { method: "POST" });
      setExtraction(result);
      setSelectedTasks(new Set(result.tasks.map((_, i) => i)));
      setSelectedEvents(new Set(result.events.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function addSelectedExtractions() {
    if (!extraction) return;
    const actions = [
      ...extraction.tasks
        .filter((_, i) => selectedTasks.has(i))
        .map((t) => ({ tool: "create_task", threadId: thread.id, payload: t })),
      ...extraction.events
        .filter((_, i) => selectedEvents.has(i))
        .map((e) => ({
          tool: "create_event",
          threadId: thread.id,
          payload: { ...e, attendees: inboundSenders },
        })),
    ];
    if (actions.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          kind: "task_extraction",
          summary: `Add ${actions.length} item(s) extracted from "${thread.subject}"`,
          actions,
        }),
      });
      setExtraction(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setBusy(false);
    }
  }

  // --- Quick single-thread actions (archive/snooze) ---
  async function quickAction(tool: "archive_emails" | "snooze_emails", payload: Record<string, unknown>, summary: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/plans", {
        method: "POST",
        body: JSON.stringify({ kind: tool, summary, actions: [{ tool, threadId: thread.id, payload }] }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setBusy(false);
    }
  }

  const decisions: string[] = thread.decisions ? JSON.parse(thread.decisions) : [];
  const openQuestions: string[] = thread.openQuestions ? JSON.parse(thread.openQuestions) : [];
  const actionItems: { owner: string; action: string; dueDate: string | null }[] = thread.actionItems
    ? JSON.parse(thread.actionItems)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-neutral-900">{thread.subject}</h1>
          {thread.category && <Badge label={thread.category} />}
          {thread.priority && <Badge label={thread.priority} />}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {thread.connectedAccount.email} ({thread.connectedAccount.provider})
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => quickAction("archive_emails", {}, `Archive "${thread.subject}"`)}
            disabled={busy || thread.isArchived}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            {thread.isArchived ? "Archived" : "Archive"}
          </button>
          <button
            onClick={() =>
              quickAction(
                "snooze_emails",
                { until: new Date(Date.now() + 3 * 86_400_000).toISOString() },
                `Snooze "${thread.subject}" for 3 days`
              )
            }
            disabled={busy}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Snooze 3 days
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Summary</h2>
          <button onClick={summarize} disabled={summarizing} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
            {summarizing ? "Summarizing..." : thread.blufSummary ? "Regenerate" : "Generate summary"}
          </button>
        </div>
        {thread.blufSummary ? (
          <div className="space-y-2 text-sm text-neutral-700">
            <p>{thread.blufSummary}</p>
            {decisions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-neutral-500">Decisions</p>
                <ul className="list-inside list-disc">
                  {decisions.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
            {openQuestions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-neutral-500">Open questions</p>
                <ul className="list-inside list-disc">
                  {openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}
            {actionItems.length > 0 && (
              <div>
                <p className="text-xs font-medium text-neutral-500">Action items</p>
                <ul className="list-inside list-disc">
                  {actionItems.map((a, i) => (
                    <li key={i}>
                      {a.owner}: {a.action} {a.dueDate ? `(by ${a.dueDate})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-400">No summary yet.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-700">Messages</h2>
        <div className="space-y-3">
          {thread.messages.map((m) => (
            <div key={m.id} className="rounded-md border border-neutral-100 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {m.direction === "inbound" ? (m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail) : "You"}
                </span>
                <span>{new Date(m.sentAt).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-neutral-800">{m.bodyText}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-700">Draft a reply</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs">
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional instructions (e.g. offer a 10% discount)"
            className="min-w-[16rem] flex-1 rounded-md border border-neutral-300 px-2 py-1 text-xs"
          />
          <button
            onClick={generateDraft}
            disabled={generatingDraft}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {generatingDraft ? "Generating..." : "Generate AI draft"}
          </button>
        </div>

        {draft && (
          <div className="space-y-2 rounded-md border border-neutral-200 p-3">
            <input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm font-medium"
            />
            <textarea
              value={draft.bodyText}
              onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
              rows={8}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
            <p className="text-xs text-neutral-400">To: {inboundSenders.join(", ") || "(no recipient detected)"}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => proposeDraft("save_draft")}
                disabled={busy}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                Propose: Save as Draft
              </button>
              <button
                onClick={() => proposeDraft("send_email")}
                disabled={busy}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Propose: Send
              </button>
            </div>
          </div>
        )}

        {thread.drafts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-neutral-500">Draft history</p>
            <ul className="mt-1 space-y-1">
              {thread.drafts.map((d) => (
                <li key={d.id} className="text-xs text-neutral-500">
                  <Badge label={d.status} /> {d.subject}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Tasks &amp; events</h2>
          <button onClick={extract} disabled={extracting} className="text-xs text-blue-600 hover:underline disabled:opacity-50">
            {extracting ? "Extracting..." : "Extract from thread"}
          </button>
        </div>
        {extraction && (
          <div className="space-y-3">
            {extraction.tasks.length === 0 && extraction.events.length === 0 && (
              <p className="text-sm text-neutral-400">No clear tasks or events found.</p>
            )}
            {extraction.tasks.map((t, i) => (
              <label key={`task-${i}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTasks.has(i)}
                  onChange={() =>
                    setSelectedTasks((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
                Task: {t.title} <Badge label={t.priority} />
              </label>
            ))}
            {extraction.events.map((ev, i) => (
              <label key={`event-${i}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedEvents.has(i)}
                  onChange={() =>
                    setSelectedEvents((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
                Event: {ev.title} ({new Date(ev.startTime).toLocaleString()})
              </label>
            ))}
            {(extraction.tasks.length > 0 || extraction.events.length > 0) && (
              <button
                onClick={addSelectedExtractions}
                disabled={busy}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Propose: Add selected
              </button>
            )}
          </div>
        )}
      </section>

      {plans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">Proposed actions for this thread</h2>
          {plans.map((plan) => (
            <PlanReviewPanel key={plan.id} plan={plan} />
          ))}
        </section>
      )}
    </div>
  );
}
