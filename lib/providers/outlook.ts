import { mapWithConcurrency } from "@/lib/concurrency";
import { stripHtml } from "./html";
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

// Microsoft Graph adapter, using the REST API directly over fetch to avoid
// pulling in the full Graph SDK for a handful of endpoints.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: "text" | "html"; content: string };
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: { emailAddress: { name?: string; address: string } }[];
  sentDateTime: string;
  categories: string[];
}

interface GraphPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export interface MicrosoftTokens {
  accessToken: string;
}

async function graphFetch<T>(path: string, tokens: MicrosoftTokens, init?: RequestInit): Promise<T> {
  const url = path.startsWith("https://") ? path : `${GRAPH_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${path} failed: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function toProviderMessage(msg: GraphMessage, myEmail: string): ProviderMessage {
  const fromEmail = msg.from?.emailAddress.address ?? "";
  return {
    providerMessageId: msg.id,
    fromName: msg.from?.emailAddress.name,
    fromEmail,
    toEmails: (msg.toRecipients ?? []).map((r) => r.emailAddress.address),
    subject: msg.subject,
    bodyText: msg.body.contentType === "text" ? msg.body.content : stripHtml(msg.body.content),
    bodyHtml: msg.body.contentType === "html" ? msg.body.content : undefined,
    sentAt: msg.sentDateTime,
    direction: fromEmail.toLowerCase() === myEmail.toLowerCase() ? "outbound" : "inbound",
  };
}

async function messagesToThread(messages: GraphMessage[], myEmail: string): Promise<ProviderThread> {
  const sorted = [...messages].sort((a, b) => a.sentDateTime.localeCompare(b.sentDateTime));
  const converted = sorted.map((m) => toProviderMessage(m, myEmail));
  const last = sorted[sorted.length - 1];
  return {
    providerThreadId: last.conversationId,
    subject: last.subject,
    participants: Array.from(new Set(converted.flatMap((m) => [m.fromEmail, ...m.toEmails]))).map((email) => ({
      email,
    })),
    snippet: last.bodyPreview,
    lastMessageAt: last.sentDateTime,
    labels: last.categories ?? [],
    messages: converted,
  };
}

export class OutlookProvider implements EmailProvider {
  readonly kind = "microsoft" as const;

  constructor(private tokens: MicrosoftTokens, private myEmail: string) {}

  async fetchEmails(filters: FetchEmailsFilters): Promise<ProviderThread[]> {
    const target = filters.maxResults ?? 25;
    const pageSize = Math.min(100, target);
    const params = new URLSearchParams({
      $top: String(pageSize),
      $orderby: "sentDateTime desc",
    });
    if (filters.after) params.set("$filter", `sentDateTime ge ${filters.after}`);
    if (filters.query) params.set("$search", `"${filters.query}"`);

    const messages: GraphMessage[] = [];
    let next: string | undefined = `/me/messages?${params.toString()}`;
    while (next && messages.length < target) {
      const page: GraphPage<GraphMessage> = await graphFetch<GraphPage<GraphMessage>>(next, this.tokens);
      messages.push(...page.value);
      next = page["@odata.nextLink"];
    }

    const byConversation = new Map<string, GraphMessage[]>();
    for (const msg of messages) {
      const list = byConversation.get(msg.conversationId) ?? [];
      list.push(msg);
      byConversation.set(msg.conversationId, list);
    }
    return mapWithConcurrency([...byConversation.values()], 8, (msgs) => messagesToThread(msgs, this.myEmail));
  }

  async fetchThread(providerThreadId: string): Promise<ProviderThread | null> {
    const params = new URLSearchParams({
      $filter: `conversationId eq '${providerThreadId}'`,
      $orderby: "sentDateTime asc",
    });
    const { value } = await graphFetch<{ value: GraphMessage[] }>(`/me/messages?${params.toString()}`, this.tokens);
    if (!value.length) return null;
    return messagesToThread(value, this.myEmail);
  }

  async sendEmail(payload: SendEmailPayload): Promise<{ providerMessageId: string }> {
    if (payload.inReplyToThreadId) {
      const thread = await this.fetchThread(payload.inReplyToThreadId);
      const lastMessageId = thread?.messages[thread.messages.length - 1]?.providerMessageId;
      if (lastMessageId) {
        await graphFetch(`/me/messages/${lastMessageId}/reply`, this.tokens, {
          method: "POST",
          body: JSON.stringify({ comment: payload.bodyText }),
        });
        return { providerMessageId: lastMessageId };
      }
    }
    await graphFetch(`/me/sendMail`, this.tokens, {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: payload.subject,
          body: { contentType: "Text", content: payload.bodyText },
          toRecipients: payload.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: payload.cc?.map((address) => ({ emailAddress: { address } })),
        },
      }),
    });
    return { providerMessageId: "" };
  }

  async saveDraft(payload: SaveDraftPayload): Promise<{ providerDraftId: string }> {
    const draft = await graphFetch<{ id: string }>(`/me/messages`, this.tokens, {
      method: "POST",
      body: JSON.stringify({
        subject: payload.subject,
        body: { contentType: "Text", content: payload.bodyText },
        toRecipients: payload.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: payload.cc?.map((address) => ({ emailAddress: { address } })),
      }),
    });
    return { providerDraftId: draft.id };
  }

  private async messageIdsForThread(providerThreadId: string): Promise<string[]> {
    const params = new URLSearchParams({ $filter: `conversationId eq '${providerThreadId}'` });
    const { value } = await graphFetch<{ value: { id: string }[] }>(`/me/messages?${params.toString()}`, this.tokens);
    return value.map((m) => m.id);
  }

  async archiveEmails(providerThreadIds: string[]): Promise<{ previousArchived: Record<string, boolean> }> {
    const previousArchived: Record<string, boolean> = {};
    for (const threadId of providerThreadIds) {
      previousArchived[threadId] = false; // Graph has no direct "is archived" read without folder lookup
      const messageIds = await this.messageIdsForThread(threadId);
      for (const id of messageIds) {
        await graphFetch(`/me/messages/${id}/move`, this.tokens, {
          method: "POST",
          body: JSON.stringify({ destinationId: "archive" }),
        });
      }
    }
    return { previousArchived };
  }

  async unarchiveEmails(providerThreadIds: string[]): Promise<void> {
    for (const threadId of providerThreadIds) {
      const messageIds = await this.messageIdsForThread(threadId);
      for (const id of messageIds) {
        await graphFetch(`/me/messages/${id}/move`, this.tokens, {
          method: "POST",
          body: JSON.stringify({ destinationId: "inbox" }),
        });
      }
    }
  }

  async labelEmails(
    providerThreadIds: string[],
    addLabels: string[],
    removeLabels: string[]
  ): Promise<LabelChangeResult> {
    const previousLabels: Record<string, string[]> = {};
    for (const threadId of providerThreadIds) {
      const messageIds = await this.messageIdsForThread(threadId);
      for (const id of messageIds) {
        const msg = await graphFetch<{ categories: string[] }>(`/me/messages/${id}?$select=categories`, this.tokens);
        previousLabels[threadId] = msg.categories ?? [];
        const next = Array.from(
          new Set([...(msg.categories ?? []).filter((c) => !removeLabels.includes(c)), ...addLabels])
        );
        await graphFetch(`/me/messages/${id}`, this.tokens, {
          method: "PATCH",
          body: JSON.stringify({ categories: next }),
        });
      }
    }
    return { previousLabels };
  }

  async snoozeEmails(
    providerThreadIds: string[],
    until: string
  ): Promise<{ previousSnoozeUntil: Record<string, string | null> }> {
    // Graph has no native snooze endpoint either; approximate the same way
    // as Gmail: move out of the inbox and tag with a dated category. A
    // scheduled job restores the message to the inbox when `until` passes.
    const previousSnoozeUntil: Record<string, string | null> = {};
    const label = `InboxPilot/Snoozed-Until-${until.slice(0, 10)}`;
    for (const threadId of providerThreadIds) {
      previousSnoozeUntil[threadId] = null;
      const messageIds = await this.messageIdsForThread(threadId);
      for (const id of messageIds) {
        await graphFetch(`/me/messages/${id}`, this.tokens, {
          method: "PATCH",
          body: JSON.stringify({ categories: [label] }),
        });
        await graphFetch(`/me/messages/${id}/move`, this.tokens, {
          method: "POST",
          body: JSON.stringify({ destinationId: "archive" }),
        });
      }
    }
    return { previousSnoozeUntil };
  }
}

export class OutlookCalendarProvider implements CalendarProvider {
  readonly kind = "microsoft" as const;

  constructor(private tokens: MicrosoftTokens) {}

  async createEvent(payload: CreateEventPayload): Promise<{ providerEventId: string }> {
    const event = await graphFetch<{ id: string }>(`/me/events`, this.tokens, {
      method: "POST",
      body: JSON.stringify({
        subject: payload.title,
        body: { contentType: "Text", content: payload.description ?? "" },
        start: { dateTime: payload.startTime, timeZone: "UTC" },
        end: { dateTime: payload.endTime, timeZone: "UTC" },
        location: payload.location ? { displayName: payload.location } : undefined,
        attendees: payload.attendees?.map((address) => ({ emailAddress: { address }, type: "required" })),
      }),
    });
    return { providerEventId: event.id };
  }

  async deleteEvent(providerEventId: string): Promise<void> {
    await graphFetch(`/me/events/${providerEventId}`, this.tokens, { method: "DELETE" });
  }
}
