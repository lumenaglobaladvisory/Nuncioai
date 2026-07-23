import { google, gmail_v1 } from "googleapis";
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

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
}

function oauthClient(tokens: GoogleTokens) {
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken ?? undefined });
  return client;
}

function decodeBody(payload?: gmail_v1.Schema$MessagePart): { text: string; html?: string } {
  if (!payload) return { text: "" };
  const parts = payload.parts ?? [payload];
  let text = "";
  let html: string | undefined;
  for (const part of parts) {
    const data = part.body?.data;
    if (!data) continue;
    const decoded = Buffer.from(data, "base64url").toString("utf-8");
    if (part.mimeType === "text/html") html = decoded;
    else if (part.mimeType === "text/plain") text = decoded;
  }
  if (!text && html) text = html.replace(/<[^>]+>/g, " ");
  return { text, html };
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function toProviderMessage(msg: gmail_v1.Schema$Message, myEmail: string): ProviderMessage {
  const headers = msg.payload?.headers ?? [];
  const from = headerValue(headers, "From");
  const fromMatch = from.match(/^(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?$/);
  const { text, html } = decodeBody(msg.payload ?? undefined);
  const toEmails = headerValue(headers, "To")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fromEmail = fromMatch?.[2] ?? from;
  return {
    providerMessageId: msg.id ?? "",
    fromName: fromMatch?.[1]?.trim() || undefined,
    fromEmail,
    toEmails,
    subject: headerValue(headers, "Subject"),
    bodyText: text,
    bodyHtml: html,
    sentAt: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
    direction: fromEmail.toLowerCase() === myEmail.toLowerCase() ? "outbound" : "inbound",
  };
}

function buildRawMime(payload: SendEmailPayload, from: string, inReplyToMessageId?: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${payload.to.join(", ")}`,
    payload.cc?.length ? `Cc: ${payload.cc.join(", ")}` : undefined,
    `Subject: ${payload.subject}`,
    inReplyToMessageId ? `In-Reply-To: <${inReplyToMessageId}>` : undefined,
    inReplyToMessageId ? `References: <${inReplyToMessageId}>` : undefined,
    "Content-Type: text/plain; charset=utf-8",
    "",
    payload.bodyText,
  ].filter((l): l is string => l !== undefined);
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export class GmailProvider implements EmailProvider {
  readonly kind = "google" as const;
  private gmail: gmail_v1.Gmail;

  constructor(tokens: GoogleTokens, private myEmail: string) {
    this.gmail = google.gmail({ version: "v1", auth: oauthClient(tokens) });
  }

  private async labelNameToId(name: string): Promise<string> {
    const { data } = await this.gmail.users.labels.list({ userId: "me" });
    const existing = data.labels?.find((l) => l.name === name);
    if (existing?.id) return existing.id;
    const created = await this.gmail.users.labels.create({
      userId: "me",
      requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    return created.data.id!;
  }

  async fetchEmails(filters: FetchEmailsFilters): Promise<ProviderThread[]> {
    const { data } = await this.gmail.users.threads.list({
      userId: "me",
      maxResults: filters.maxResults ?? 25,
      q: filters.query,
      labelIds: filters.labelIds,
    });
    const threads = await Promise.all((data.threads ?? []).map((t) => this.fetchThread(t.id!)));
    return threads.filter((t): t is ProviderThread => t !== null);
  }

  async fetchThread(providerThreadId: string): Promise<ProviderThread | null> {
    const { data } = await this.gmail.users.threads.get({ userId: "me", id: providerThreadId, format: "full" });
    if (!data.messages?.length) return null;
    const messages = data.messages.map((m) => toProviderMessage(m, this.myEmail));
    const last = messages[messages.length - 1];
    return {
      providerThreadId,
      subject: messages[0]?.subject ?? "(no subject)",
      participants: Array.from(new Set(messages.flatMap((m) => [m.fromEmail, ...m.toEmails]))).map((email) => ({
        email,
      })),
      snippet: data.snippet ?? undefined,
      lastMessageAt: last?.sentAt ?? new Date().toISOString(),
      labels: data.messages[data.messages.length - 1]?.labelIds ?? [],
      messages,
    };
  }

  async sendEmail(payload: SendEmailPayload): Promise<{ providerMessageId: string }> {
    const { data } = await this.gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: buildRawMime(payload, this.myEmail),
        threadId: payload.inReplyToThreadId,
      },
    });
    return { providerMessageId: data.id ?? "" };
  }

  async saveDraft(payload: SaveDraftPayload): Promise<{ providerDraftId: string }> {
    const { data } = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: { raw: buildRawMime(payload, this.myEmail), threadId: payload.inReplyToThreadId },
      },
    });
    return { providerDraftId: data.id ?? "" };
  }

  async archiveEmails(providerThreadIds: string[]): Promise<{ previousArchived: Record<string, boolean> }> {
    const previousArchived: Record<string, boolean> = {};
    for (const id of providerThreadIds) {
      const thread = await this.gmail.users.threads.get({ userId: "me", id, format: "minimal" });
      const labelIds = thread.data.messages?.[0]?.labelIds ?? [];
      previousArchived[id] = !labelIds.includes("INBOX");
      await this.gmail.users.threads.modify({ userId: "me", id, requestBody: { removeLabelIds: ["INBOX"] } });
    }
    return { previousArchived };
  }

  async unarchiveEmails(providerThreadIds: string[]): Promise<void> {
    for (const id of providerThreadIds) {
      await this.gmail.users.threads.modify({ userId: "me", id, requestBody: { addLabelIds: ["INBOX"] } });
    }
  }

  async labelEmails(
    providerThreadIds: string[],
    addLabels: string[],
    removeLabels: string[]
  ): Promise<LabelChangeResult> {
    const addIds = await Promise.all(addLabels.map((name) => this.labelNameToId(name)));
    const removeIds = await Promise.all(removeLabels.map((name) => this.labelNameToId(name)));
    const previousLabels: Record<string, string[]> = {};
    for (const id of providerThreadIds) {
      const thread = await this.gmail.users.threads.get({ userId: "me", id, format: "minimal" });
      previousLabels[id] = thread.data.messages?.[0]?.labelIds ?? [];
      await this.gmail.users.threads.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds: addIds, removeLabelIds: removeIds },
      });
    }
    return { previousLabels };
  }

  async snoozeEmails(
    providerThreadIds: string[],
    until: string
  ): Promise<{ previousSnoozeUntil: Record<string, string | null> }> {
    // Gmail's native "Snooze" is a client-only Inbox feature with no public
    // API. We approximate it by archiving (removing INBOX) and applying a
    // dated label; a scheduled job re-adds INBOX when `until` passes.
    const label = await this.labelNameToId(`InboxPilot/Snoozed-Until-${until.slice(0, 10)}`);
    const previousSnoozeUntil: Record<string, string | null> = {};
    for (const id of providerThreadIds) {
      previousSnoozeUntil[id] = null;
      await this.gmail.users.threads.modify({
        userId: "me",
        id,
        requestBody: { removeLabelIds: ["INBOX"], addLabelIds: [label] },
      });
    }
    return { previousSnoozeUntil };
  }
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly kind = "google" as const;
  private calendar;

  constructor(tokens: GoogleTokens) {
    this.calendar = google.calendar({ version: "v3", auth: oauthClient(tokens) });
  }

  async createEvent(payload: CreateEventPayload): Promise<{ providerEventId: string }> {
    const { data } = await this.calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: payload.title,
        description: payload.description,
        location: payload.location,
        start: { dateTime: payload.startTime },
        end: { dateTime: payload.endTime },
        attendees: payload.attendees?.map((email) => ({ email })),
      },
    });
    return { providerEventId: data.id ?? "" };
  }

  async deleteEvent(providerEventId: string): Promise<void> {
    await this.calendar.events.delete({ calendarId: "primary", eventId: providerEventId });
  }
}
