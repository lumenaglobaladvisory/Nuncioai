import { prisma } from "@/lib/prisma";
import type {
  CalendarProvider,
  CreateEventPayload,
  EmailProvider,
  FetchEmailsFilters,
  LabelChangeResult,
  ProviderMessage,
  ProviderThread,
  SaveDraftPayload,
  SendEmailPayload,
} from "./types";

// Fixture provider used for any ConnectedAccount with provider === "mock".
// It reads/writes directly against our own EmailThread/EmailMessage tables
// (seeded via prisma/seed.ts), so the full triage -> summarize -> draft ->
// plan -> execute/undo loop is exercisable without live Gmail/Outlook
// credentials.

function toProviderThread(
  thread: {
    providerThreadId: string;
    subject: string;
    participants: string;
    snippet: string | null;
    lastMessageAt: Date;
    labels: string | null;
    messages: {
      providerMessageId: string;
      fromName: string | null;
      fromEmail: string;
      toEmails: string;
      ccEmails: string | null;
      subject: string;
      bodyText: string;
      bodyHtml: string | null;
      sentAt: Date;
      direction: string;
    }[];
  }
): ProviderThread {
  return {
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    participants: JSON.parse(thread.participants),
    snippet: thread.snippet ?? undefined,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    labels: thread.labels ? JSON.parse(thread.labels) : [],
    messages: thread.messages.map(
      (m): ProviderMessage => ({
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
      })
    ),
  };
}

export class MockEmailProvider implements EmailProvider {
  readonly kind = "mock" as const;

  constructor(private connectedAccountId: string) {}

  async fetchEmails(filters: FetchEmailsFilters): Promise<ProviderThread[]> {
    const threads = await prisma.emailThread.findMany({
      where: {
        connectedAccountId: this.connectedAccountId,
        isArchived: false,
        ...(filters.after ? { lastMessageAt: { gte: new Date(filters.after) } } : {}),
      },
      include: { messages: { orderBy: { sentAt: "asc" } } },
      orderBy: { lastMessageAt: "desc" },
      take: filters.maxResults ?? 50,
    });
    return threads.map(toProviderThread);
  }

  async fetchThread(providerThreadId: string): Promise<ProviderThread | null> {
    const thread = await prisma.emailThread.findFirst({
      where: { connectedAccountId: this.connectedAccountId, providerThreadId },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    });
    return thread ? toProviderThread(thread) : null;
  }

  async sendEmail(payload: SendEmailPayload): Promise<{ providerMessageId: string }> {
    const providerMessageId = `mock-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (payload.inReplyToThreadId) {
      const thread = await prisma.emailThread.findFirst({
        where: { connectedAccountId: this.connectedAccountId, providerThreadId: payload.inReplyToThreadId },
      });
      if (thread) {
        await prisma.emailMessage.create({
          data: {
            threadId: thread.id,
            providerMessageId,
            fromEmail: "me@inboxpilot.demo",
            fromName: "Me",
            toEmails: JSON.stringify(payload.to),
            ccEmails: payload.cc ? JSON.stringify(payload.cc) : null,
            subject: payload.subject,
            bodyText: payload.bodyText,
            bodyHtml: payload.bodyHtml,
            sentAt: new Date(),
            direction: "outbound",
          },
        });
        await prisma.emailThread.update({
          where: { id: thread.id },
          data: { lastMessageAt: new Date() },
        });
      }
    }
    return { providerMessageId };
  }

  async saveDraft(_payload: SaveDraftPayload): Promise<{ providerDraftId: string }> {
    return { providerDraftId: `mock-draft-${Date.now()}` };
  }

  async archiveEmails(providerThreadIds: string[]): Promise<{ previousArchived: Record<string, boolean> }> {
    const threads = await prisma.emailThread.findMany({
      where: { connectedAccountId: this.connectedAccountId, providerThreadId: { in: providerThreadIds } },
    });
    const previousArchived: Record<string, boolean> = {};
    for (const t of threads) previousArchived[t.providerThreadId] = t.isArchived;
    await prisma.emailThread.updateMany({
      where: { connectedAccountId: this.connectedAccountId, providerThreadId: { in: providerThreadIds } },
      data: { isArchived: true },
    });
    return { previousArchived };
  }

  async unarchiveEmails(providerThreadIds: string[]): Promise<void> {
    await prisma.emailThread.updateMany({
      where: { connectedAccountId: this.connectedAccountId, providerThreadId: { in: providerThreadIds } },
      data: { isArchived: false },
    });
  }

  async labelEmails(
    providerThreadIds: string[],
    addLabels: string[],
    removeLabels: string[]
  ): Promise<LabelChangeResult> {
    const threads = await prisma.emailThread.findMany({
      where: { connectedAccountId: this.connectedAccountId, providerThreadId: { in: providerThreadIds } },
    });
    const previousLabels: Record<string, string[]> = {};
    for (const t of threads) {
      const current: string[] = t.labels ? JSON.parse(t.labels) : [];
      previousLabels[t.providerThreadId] = current;
      const next = Array.from(new Set([...current.filter((l) => !removeLabels.includes(l)), ...addLabels]));
      await prisma.emailThread.update({ where: { id: t.id }, data: { labels: JSON.stringify(next) } });
    }
    return { previousLabels };
  }

  async snoozeEmails(
    providerThreadIds: string[],
    until: string
  ): Promise<{ previousSnoozeUntil: Record<string, string | null> }> {
    const threads = await prisma.emailThread.findMany({
      where: { connectedAccountId: this.connectedAccountId, providerThreadId: { in: providerThreadIds } },
    });
    const previousSnoozeUntil: Record<string, string | null> = {};
    for (const t of threads) {
      previousSnoozeUntil[t.providerThreadId] = t.snoozedUntil ? t.snoozedUntil.toISOString() : null;
      await prisma.emailThread.update({ where: { id: t.id }, data: { snoozedUntil: new Date(until) } });
    }
    return { previousSnoozeUntil };
  }
}

export class MockCalendarProvider implements CalendarProvider {
  readonly kind = "mock" as const;

  async createEvent(payload: CreateEventPayload): Promise<{ providerEventId: string }> {
    void payload;
    return { providerEventId: `mock-event-${Date.now()}` };
  }

  async deleteEvent(_providerEventId: string): Promise<void> {
    // no-op: nothing external to clean up for the mock provider
  }
}
