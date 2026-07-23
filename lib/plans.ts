import { prisma } from "@/lib/prisma";
import { getCalendarProvider, getEmailProvider } from "@/lib/providers";
import type { Plan, PlanAction } from "@prisma/client";

export const TOOL_NAMES = [
  "send_email",
  "save_draft",
  "archive_emails",
  "label_emails",
  "snooze_emails",
  "create_task",
  "create_event",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const DEFAULT_RISK: Record<ToolName, "low" | "medium" | "high"> = {
  send_email: "high",
  save_draft: "low",
  archive_emails: "low",
  label_emails: "low",
  snooze_emails: "low",
  create_task: "low",
  create_event: "medium",
};

const DEFAULT_REVERSIBLE: Record<ToolName, boolean> = {
  send_email: false, // never undoable - an inbox already received it
  save_draft: true,
  archive_emails: true,
  label_emails: true,
  snooze_emails: true,
  create_task: true,
  create_event: true,
};

export interface PlanActionInput {
  tool: ToolName;
  threadId?: string;
  payload: Record<string, unknown>;
  riskLevel?: "low" | "medium" | "high";
}

export interface CreatePlanInput {
  userId: string;
  kind: string;
  summary: string;
  actions: PlanActionInput[];
  sourcePolicyId?: string;
}

export async function createPlan(input: CreatePlanInput) {
  const overallRisk = input.actions.some((a) => (a.riskLevel ?? DEFAULT_RISK[a.tool]) === "high")
    ? "high"
    : input.actions.some((a) => (a.riskLevel ?? DEFAULT_RISK[a.tool]) === "medium")
      ? "medium"
      : "low";

  const planJson = JSON.stringify({
    kind: input.kind,
    summary: input.summary,
    actions: input.actions.map((a) => ({ tool: a.tool, threadId: a.threadId, payload: a.payload })),
  });

  return prisma.plan.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      summary: input.summary,
      planJson,
      riskLevel: overallRisk,
      sourcePolicyId: input.sourcePolicyId,
      actions: {
        create: input.actions.map((a) => ({
          tool: a.tool,
          threadId: a.threadId,
          payload: JSON.stringify(a.payload),
          riskLevel: a.riskLevel ?? DEFAULT_RISK[a.tool],
          reversible: DEFAULT_REVERSIBLE[a.tool],
        })),
      },
    },
    include: { actions: true },
  });
}

async function threadWithAccount(threadId: string) {
  const thread = await prisma.emailThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { connectedAccount: true },
  });
  return thread;
}

async function runTool(action: PlanAction): Promise<{ previousState: unknown }> {
  const payload = JSON.parse(action.payload) as Record<string, unknown>;
  const tool = action.tool as ToolName;

  if (tool === "create_task") {
    const task = await prisma.task.create({
      data: {
        userId: (await prisma.plan.findUniqueOrThrow({ where: { id: action.planId } })).userId,
        threadId: action.threadId,
        title: String(payload.title),
        description: (payload.description as string | undefined) ?? null,
        dueDate: payload.dueDate ? new Date(payload.dueDate as string) : null,
        priority: (payload.priority as string) ?? "medium",
      },
    });
    return { previousState: { taskId: task.id } };
  }

  if (tool === "create_event") {
    const plan = await prisma.plan.findUniqueOrThrow({ where: { id: action.planId } });
    let providerEventId: string | undefined;
    if (action.threadId) {
      const thread = await threadWithAccount(action.threadId);
      const calendar = getCalendarProvider(thread.connectedAccount);
      const created = await calendar.createEvent({
        title: String(payload.title),
        description: payload.description as string | undefined,
        startTime: String(payload.startTime),
        endTime: String(payload.endTime),
        location: payload.location as string | undefined,
        attendees: payload.attendees as string[] | undefined,
      });
      providerEventId = created.providerEventId;
    }
    const event = await prisma.calendarEvent.create({
      data: {
        userId: plan.userId,
        threadId: action.threadId,
        title: String(payload.title),
        description: (payload.description as string | undefined) ?? null,
        startTime: new Date(payload.startTime as string),
        endTime: new Date(payload.endTime as string),
        location: (payload.location as string | undefined) ?? null,
        attendees: payload.attendees ? JSON.stringify(payload.attendees) : null,
        providerEventId,
        status: "created",
      },
    });
    return { previousState: { eventId: event.id, providerEventId } };
  }

  // Remaining tools all act on a single connected EmailThread.
  if (!action.threadId) throw new Error(`Tool ${tool} requires a threadId`);
  const thread = await threadWithAccount(action.threadId);
  const provider = getEmailProvider(thread.connectedAccount);

  switch (tool) {
    case "send_email": {
      const result = await provider.sendEmail({
        inReplyToThreadId: thread.providerThreadId,
        to: payload.to as string[],
        cc: payload.cc as string[] | undefined,
        subject: String(payload.subject),
        bodyText: String(payload.bodyText),
      });
      await prisma.emailMessage.create({
        data: {
          threadId: thread.id,
          providerMessageId: result.providerMessageId,
          fromEmail: thread.connectedAccount.email,
          fromName: thread.connectedAccount.displayName,
          toEmails: JSON.stringify(payload.to),
          ccEmails: payload.cc ? JSON.stringify(payload.cc) : null,
          subject: String(payload.subject),
          bodyText: String(payload.bodyText),
          sentAt: new Date(),
          direction: "outbound",
        },
      });
      return { previousState: null };
    }
    case "save_draft": {
      const result = await provider.saveDraft({
        inReplyToThreadId: thread.providerThreadId,
        to: payload.to as string[],
        cc: payload.cc as string[] | undefined,
        subject: String(payload.subject),
        bodyText: String(payload.bodyText),
      });
      const draft = await prisma.draft.create({
        data: {
          threadId: thread.id,
          subject: String(payload.subject),
          bodyText: String(payload.bodyText),
          tone: payload.tone as string | undefined,
        },
      });
      return { previousState: { draftId: draft.id, providerDraftId: result.providerDraftId } };
    }
    case "archive_emails": {
      const { previousArchived } = await provider.archiveEmails([thread.providerThreadId]);
      await prisma.emailThread.update({ where: { id: thread.id }, data: { isArchived: true } });
      return { previousState: { isArchived: previousArchived[thread.providerThreadId] ?? false } };
    }
    case "label_emails": {
      const addLabels = (payload.addLabels as string[]) ?? [];
      const removeLabels = (payload.removeLabels as string[]) ?? [];
      const { previousLabels } = await provider.labelEmails([thread.providerThreadId], addLabels, removeLabels);
      const prev = previousLabels[thread.providerThreadId] ?? [];
      const next = Array.from(new Set([...prev.filter((l) => !removeLabels.includes(l)), ...addLabels]));
      await prisma.emailThread.update({ where: { id: thread.id }, data: { labels: JSON.stringify(next) } });
      return { previousState: { labels: prev } };
    }
    case "snooze_emails": {
      const until = String(payload.until);
      const { previousSnoozeUntil } = await provider.snoozeEmails([thread.providerThreadId], until);
      await prisma.emailThread.update({ where: { id: thread.id }, data: { snoozedUntil: new Date(until) } });
      return { previousState: { snoozedUntil: previousSnoozeUntil[thread.providerThreadId] ?? null } };
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

export async function executePlanAction(actionId: string): Promise<PlanAction> {
  const action = await prisma.planAction.findUniqueOrThrow({ where: { id: actionId } });
  try {
    const { previousState } = await runTool(action);
    return prisma.planAction.update({
      where: { id: action.id },
      data: {
        status: "executed",
        executedAt: new Date(),
        previousState: previousState === null ? null : JSON.stringify(previousState),
      },
    });
  } catch (err) {
    return prisma.planAction.update({
      where: { id: action.id },
      data: { status: "failed", errorMessage: err instanceof Error ? err.message : String(err) },
    });
  }
}

export async function executePlan(planId: string): Promise<Plan> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId }, include: { actions: true } });
  const runnable = plan.actions.filter((a) => a.status === "approved" || a.status === "pending");
  for (const action of runnable) {
    await executePlanAction(action.id);
  }
  return prisma.plan.update({ where: { id: planId }, data: { status: "executed", executedAt: new Date() } });
}

async function undoTool(action: PlanAction): Promise<void> {
  if (!action.previousState) return;
  const previous = JSON.parse(action.previousState) as Record<string, unknown>;
  const tool = action.tool as ToolName;

  if (tool === "create_task") {
    await prisma.task.delete({ where: { id: previous.taskId as string } }).catch(() => undefined);
    return;
  }

  if (tool === "create_event") {
    const event = await prisma.calendarEvent.findUnique({ where: { id: previous.eventId as string } });
    if (event?.threadId && event.providerEventId) {
      const thread = await threadWithAccount(event.threadId);
      const calendar = getCalendarProvider(thread.connectedAccount);
      await calendar.deleteEvent(event.providerEventId).catch(() => undefined);
    }
    if (event) await prisma.calendarEvent.delete({ where: { id: event.id } });
    return;
  }

  if (!action.threadId) return;
  const thread = await threadWithAccount(action.threadId);
  const provider = getEmailProvider(thread.connectedAccount);

  switch (tool) {
    case "save_draft": {
      if (previous.draftId) {
        await prisma.draft.update({ where: { id: previous.draftId as string }, data: { status: "discarded" } });
      }
      return;
    }
    case "archive_emails": {
      const wasArchived = Boolean(previous.isArchived);
      if (!wasArchived) await provider.unarchiveEmails([thread.providerThreadId]);
      await prisma.emailThread.update({ where: { id: thread.id }, data: { isArchived: wasArchived } });
      return;
    }
    case "label_emails": {
      const prevLabels = (previous.labels as string[]) ?? [];
      const current: string[] = thread.labels ? JSON.parse(thread.labels) : [];
      const removeLabels = current.filter((l) => !prevLabels.includes(l));
      const addLabels = prevLabels.filter((l) => !current.includes(l));
      if (removeLabels.length || addLabels.length) {
        await provider.labelEmails([thread.providerThreadId], addLabels, removeLabels);
      }
      await prisma.emailThread.update({ where: { id: thread.id }, data: { labels: JSON.stringify(prevLabels) } });
      return;
    }
    case "snooze_emails": {
      const prevUntil = previous.snoozedUntil as string | null;
      if (!prevUntil) {
        await provider.unarchiveEmails([thread.providerThreadId]);
      } else {
        await provider.snoozeEmails([thread.providerThreadId], prevUntil);
      }
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { snoozedUntil: prevUntil ? new Date(prevUntil) : null },
      });
      return;
    }
    default:
      return; // send_email is not reversible; nothing to do
  }
}

export async function undoPlanAction(actionId: string): Promise<PlanAction> {
  const action = await prisma.planAction.findUniqueOrThrow({ where: { id: actionId } });
  if (!action.reversible || action.status !== "executed") {
    throw new Error(`Action ${actionId} is not undoable (reversible=${action.reversible}, status=${action.status})`);
  }
  await undoTool(action);
  return prisma.planAction.update({ where: { id: action.id }, data: { status: "undone" } });
}

export async function undoPlan(planId: string): Promise<Plan> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId }, include: { actions: true } });
  for (const action of plan.actions) {
    if (action.reversible && action.status === "executed") {
      await undoPlanAction(action.id);
    }
  }
  return prisma.plan.update({ where: { id: planId }, data: { status: "undone", undoneAt: new Date() } });
}

export async function approvePlan(planId: string, skipActionIds: string[] = []): Promise<Plan> {
  await prisma.planAction.updateMany({
    where: { planId, id: { notIn: skipActionIds } },
    data: { status: "approved" },
  });
  await prisma.planAction.updateMany({
    where: { planId, id: { in: skipActionIds } },
    data: { status: "skipped" },
  });
  return prisma.plan.update({ where: { id: planId }, data: { status: "approved" } });
}
