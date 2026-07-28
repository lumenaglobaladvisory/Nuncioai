import { prisma } from "@/lib/prisma";
import type { Policy } from "@prisma/client";
import { getLLMService } from "@/lib/llm";
import { threadWithMessagesToProviderThread } from "@/lib/triage";
import { createPlan } from "@/lib/plans";

function parseDuration(spec: string | null): number | null {
  if (!spec) return null;
  const match = spec.match(/^(\d+)([dhw])$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const msPerUnit = { h: 3600_000, d: 86_400_000, w: 604_800_000 }[unit] ?? 0;
  return value * msPerUnit;
}

function parseScope(scope: string | null): { type: "label" | "category"; value: string } | null {
  if (!scope) return null;
  if (scope.startsWith("emails_labeled:")) return { type: "label", value: scope.slice("emails_labeled:".length) };
  if (scope.startsWith("category:")) return { type: "category", value: scope.slice("category:".length) };
  return null;
}

async function scopedThreads(userId: string, policy: Policy) {
  const filter = parseScope(policy.scope);
  const threads = await prisma.emailThread.findMany({
    where: {
      connectedAccount: { userId },
      isArchived: false,
      ...(filter?.type === "category" ? { category: filter.value } : {}),
    },
    include: { messages: { orderBy: { sentAt: "asc" } } },
  });
  if (filter?.type === "label") {
    return threads.filter((t) => (t.labels ? (JSON.parse(t.labels) as string[]) : []).includes(filter.value));
  }
  return threads;
}

async function threadIdsAlreadyActedOnByPolicy(policyId: string): Promise<Set<string>> {
  const actions = await prisma.planAction.findMany({
    where: { plan: { sourcePolicyId: policyId } },
    select: { threadId: true },
  });
  return new Set(actions.map((a) => a.threadId).filter((x): x is string => Boolean(x)));
}

export interface PolicyRunResult {
  policyId: string;
  matched: number;
  planId: string | null;
}

// Meetings aren't threads, so this trigger doesn't go through the
// thread-candidate/action-switch machinery below - it's a self-contained
// path over CalendarEvent instead. Dedup is tracked by parsing prior
// PlanAction payloads for this policy (PlanAction has no direct event FK).
async function evaluateBeforeMeetingPolicy(
  userId: string,
  policy: Policy,
  delayMs: number | null
): Promise<PolicyRunResult> {
  const windowMs = delayMs ?? 86_400_000; // default: 1 day before
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  const priorActions = await prisma.planAction.findMany({
    where: { plan: { sourcePolicyId: policy.id }, tool: "create_task" },
    select: { payload: true },
  });
  const remindedEventIds = new Set(
    priorActions
      .map((a) => {
        try {
          return (JSON.parse(a.payload) as { eventId?: string }).eventId;
        } catch {
          return undefined;
        }
      })
      .filter((id): id is string => Boolean(id))
  );

  const events = await prisma.calendarEvent.findMany({
    where: { userId, status: "created", startTime: { gte: now, lte: windowEnd } },
  });
  const candidates = events.filter((e) => !remindedEventIds.has(e.id));

  await prisma.policy.update({ where: { id: policy.id }, data: { lastRunAt: new Date() } });

  if (candidates.length === 0) return { policyId: policy.id, matched: 0, planId: null };

  const actions = candidates.map((e) => ({
    tool: "create_task" as const,
    threadId: e.threadId ?? undefined,
    payload: {
      title: `Prepare for meeting: ${e.title}`,
      description: `Meeting at ${e.startTime.toISOString()}${e.location ? ` (${e.location})` : ""}.`,
      dueDate: e.startTime.toISOString(),
      priority: "medium",
      eventId: e.id,
    },
  }));

  const plan = await createPlan({
    userId,
    kind: "policy_meeting_prep",
    summary: `Policy "${policy.name}": ${actions.length} meeting prep task${actions.length === 1 ? "" : "s"} for upcoming meetings.`,
    actions,
    sourcePolicyId: policy.id,
  });
  return { policyId: policy.id, matched: candidates.length, planId: plan.id };
}

export async function evaluatePolicy(userId: string, policy: Policy): Promise<PolicyRunResult> {
  if (!policy.enabled) return { policyId: policy.id, matched: 0, planId: null };

  const delayMs = parseDuration(policy.timeDelay);

  if (policy.triggerType === "before_meeting") {
    return evaluateBeforeMeetingPolicy(userId, policy, delayMs);
  }

  const alreadyActedOn = await threadIdsAlreadyActedOnByPolicy(policy.id);
  let candidates = (await scopedThreads(userId, policy)).filter((t) => !alreadyActedOn.has(t.id));

  if (policy.triggerType === "no_reply") {
    const cutoff = delayMs ? Date.now() - delayMs : 0;
    candidates = candidates.filter((t) => {
      const last = t.messages[t.messages.length - 1];
      return last?.direction === "outbound" && t.lastMessageAt.getTime() <= cutoff;
    });
  } else if (policy.triggerType === "schedule") {
    const intervalMs = delayMs ?? 604_800_000; // default weekly
    const dueToRun = !policy.lastRunAt || Date.now() - policy.lastRunAt.getTime() >= intervalMs;
    if (!dueToRun) candidates = [];
  } else if (policy.triggerType === "label_added") {
    // scope filter already applied; nothing further to narrow.
  }

  await prisma.policy.update({ where: { id: policy.id }, data: { lastRunAt: new Date() } });

  if (candidates.length === 0) return { policyId: policy.id, matched: 0, planId: null };

  const llm = getLLMService();

  if (policy.action === "draft_followup" || policy.action === "send_reminder") {
    const actions = [];
    for (const thread of candidates) {
      const providerThread = threadWithMessagesToProviderThread(thread, thread.messages);
      const draft = await llm.draftFollowup(providerThread, policy.tone ?? "polite_firm");
      const to = Array.from(
        new Set(thread.messages.filter((m) => m.direction === "inbound").map((m) => m.fromEmail))
      );
      actions.push({
        tool: "save_draft" as const,
        threadId: thread.id,
        payload: { to, subject: draft.subject, bodyText: draft.bodyText, tone: policy.tone ?? "polite_firm" },
      });
    }
    const plan = await createPlan({
      userId,
      kind: "policy_followup",
      summary: `Policy "${policy.name}": ${actions.length} follow-up draft${actions.length === 1 ? "" : "s"} for threads with no reply${policy.timeDelay ? ` after ${policy.timeDelay}` : ""}.`,
      actions,
      sourcePolicyId: policy.id,
    });
    return { policyId: policy.id, matched: candidates.length, planId: plan.id };
  }

  if (policy.action === "summarize_and_archive") {
    const actions = [];
    for (const thread of candidates) {
      const providerThread = threadWithMessagesToProviderThread(thread, thread.messages);
      const summary = await llm.summarizeThread(providerThread);
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: {
          blufSummary: summary.bluf,
          decisions: JSON.stringify(summary.decisions),
          openQuestions: JSON.stringify(summary.openQuestions),
          actionItems: JSON.stringify(summary.actionItems),
          summarizedAt: new Date(),
        },
      });
      actions.push({ tool: "archive_emails" as const, threadId: thread.id, payload: {} });
    }
    const plan = await createPlan({
      userId,
      kind: "policy_archive",
      summary: `Policy "${policy.name}": summarized and proposing to archive ${actions.length} thread${actions.length === 1 ? "" : "s"}.`,
      actions,
      sourcePolicyId: policy.id,
    });
    return { policyId: policy.id, matched: candidates.length, planId: plan.id };
  }

  return { policyId: policy.id, matched: 0, planId: null };
}

export async function evaluateAllPolicies(userId: string): Promise<PolicyRunResult[]> {
  const policies = await prisma.policy.findMany({ where: { userId, enabled: true } });
  const results: PolicyRunResult[] = [];
  for (const policy of policies) {
    results.push(await evaluatePolicy(userId, policy));
  }
  return results;
}
