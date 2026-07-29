import { google, gmail_v1 } from "googleapis";
import { mapWithConcurrency } from "@/lib/concurrency";
import { looksLikeMarkup, stripHtml } from "./html";
import type {
  CalendarProvider,
  CreateEventPayload,
  EmailProvider,
  FetchEmailsFilters,
  LabelChangeResult,
  ListEventsFilters,
  ProviderCalendarEvent,
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

function collectBodyParts(part: gmail_v1.Schema$MessagePart, acc: { text?: string; html?: string }): void {
  const data = part.body?.data;
  if (data && part.mimeType === "text/plain" && acc.text === undefined) {
    acc.text = Buffer.from(data, "base64url").toString("utf-8");
  } else if (data && part.mimeType === "text/html" && acc.html === undefined) {
    acc.html = Buffer.from(data, "base64url").toString("utf-8");
  }
  // Multipart messages nest their real text/plain and text/html leaves
  // under container parts (multipart/alternative, multipart/related, ...),
  // sometimes more than one level deep - walk the whole tree rather than
  // assuming they're direct children of the top-level payload.
  for (const child of part.parts ?? []) {
    collectBodyParts(child, acc);
  }
}

function decodeBody(payload?: gmail_v1.Schema$MessagePart): { text: string; html?: string } {
  if (!payload) return { text: "" };
  const acc: { text?: string; html?: string } = {};
  collectBodyParts(payload, acc);
  let text = acc.text ?? "";
  const html = acc.html;
  if ((!text || looksLikeMarkup(text)) && html) {
    // Prefer a clean render of the HTML part over a text/plain part that's
    // empty or (some senders generate this) itself full of raw markup.
    text = stripHtml(html);
  } else if (looksLikeMarkup(text)) {
    text = stripHtml(text);
  }
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
    const target = filters.maxResults ?? 25;
    const threadIds: string[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await this.gmail.users.threads.list({
        userId: "me",
        maxResults: Math.min(100, target - threadIds.length),
        q: filters.query,
        labelIds: filters.labelIds,
        pageToken,
      });
      threadIds.push(...(data.threads ?? []).map((t) => t.id!));
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken && threadIds.length < target);

    const threads = await mapWithConcurrency(threadIds, 8, (id) => this.fetchThread(id));
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

  async listEvents(filters: ListEventsFilters): Promise<ProviderCalendarEvent[]> {
    const { data } = await this.calendar.events.list({
      calendarId: "primary",
      timeMin: filters.timeMin,
      timeMax: filters.timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });
    return (data.items ?? [])
      .filter((e): e is typeof e & { id: string } => Boolean(e.id && e.start && e.end))
      .map((e) => ({
        providerEventId: e.id,
        title: e.summary ?? "(no title)",
        description: e.description ?? undefined,
        startTime: e.start!.dateTime ?? e.start!.date ?? new Date().toISOString(),
        endTime: e.end!.dateTime ?? e.end!.date ?? new Date().toISOString(),
        location: e.location ?? undefined,
        attendees: e.attendees?.map((a) => a.email).filter((email): email is string => Boolean(email)),
      }));
  }
}
