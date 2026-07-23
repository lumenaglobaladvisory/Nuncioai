import { prisma } from "@/lib/prisma";
import type { EmailMessage, EmailThread } from "@prisma/client";
import type { ProviderThread } from "@/lib/providers/types";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function threadWithMessagesToProviderThread(
  thread: EmailThread,
  messages: EmailMessage[]
): ProviderThread {
  return {
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    participants: JSON.parse(thread.participants),
    snippet: thread.snippet ?? undefined,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    labels: thread.labels ? JSON.parse(thread.labels) : [],
    messages: messages.map((m) => ({
      providerMessageId: m.providerMessageId,
      fromName: m.fromName ?? undefined,
      fromEmail: m.fromEmail,
      toEmails: JSON.parse(m.toEmails),
      ccEmails: m.ccEmails ? JSON.parse(m.ccEmails) : undefined,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml ?? undefined,
      sentAt: m.sentAt.toISOString(),
      direction: m.direction as "inbound" | "outbound",
    })),
  };
}

export interface TodayItem {
  thread: EmailThread;
  reason: string;
}

/**
 * The ordered "Today" list: must_respond first (high -> medium -> low
 * priority, most recent first), then needs_review. Everything else
 * (low_value/notification/newsletter/reference) is left out of Today by
 * design - it's summarized/deferred elsewhere, not queued for action.
 */
export async function getTodayList(userId: string): Promise<TodayItem[]> {
  const threads = await prisma.emailThread.findMany({
    where: {
      connectedAccount: { userId },
      isArchived: false,
      snoozedUntil: null,
      category: { in: ["must_respond", "needs_review"] },
    },
    orderBy: [{ lastMessageAt: "desc" }],
  });

  const sorted = [...threads].sort((a, b) => {
    if (a.category !== b.category) return a.category === "must_respond" ? -1 : 1;
    const pa = PRIORITY_RANK[a.priority ?? "low"] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? "low"] ?? 2;
    if (pa !== pb) return pa - pb;
    return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

  return sorted.map((thread) => {
    const reasons: string[] = [];
    if (thread.category === "must_respond") reasons.push("Needs a direct response");
    else reasons.push("Worth a quick look");
    if (thread.priority === "high") reasons.push("high priority");
    if (thread.deadline) reasons.push(`deadline ${thread.deadline.toISOString().slice(0, 10)}`);
    if (thread.priorityReasons) {
      const parsed: string[] = JSON.parse(thread.priorityReasons);
      reasons.push(...parsed);
    }
    return { thread, reason: reasons.join(" - ") };
  });
}
