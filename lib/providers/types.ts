// Provider-agnostic contracts. Every mailbox InboxPilot talks to — Gmail,
// Outlook/Graph, or the local "mock" fixture provider used when no real
// account is connected — implements the same interface, matching the tool
// functions described in the InboxPilot system prompt (FETCH_EMAILS,
// SEND_EMAIL, ARCHIVE_EMAILS, ...).

export interface ProviderParticipant {
  name?: string;
  email: string;
}

export interface ProviderMessage {
  providerMessageId: string;
  fromName?: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string; // ISO timestamp
  direction: "inbound" | "outbound";
}

export interface ProviderThread {
  providerThreadId: string;
  subject: string;
  participants: ProviderParticipant[];
  snippet?: string;
  lastMessageAt: string; // ISO timestamp
  labels: string[];
  messages: ProviderMessage[];
}

export interface FetchEmailsFilters {
  maxResults?: number;
  query?: string;
  labelIds?: string[];
  after?: string; // ISO timestamp
}

export interface SendEmailPayload {
  inReplyToThreadId?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export type SaveDraftPayload = SendEmailPayload;

export interface LabelChangeResult {
  /** providerThreadId -> labels before the change, for undo */
  previousLabels: Record<string, string[]>;
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  startTime: string; // ISO
  endTime: string; // ISO
  location?: string;
  attendees?: string[];
}

export interface EmailProvider {
  readonly kind: "google" | "microsoft" | "mock";

  fetchEmails(filters: FetchEmailsFilters): Promise<ProviderThread[]>;
  fetchThread(providerThreadId: string): Promise<ProviderThread | null>;
  sendEmail(payload: SendEmailPayload): Promise<{ providerMessageId: string }>;
  saveDraft(payload: SaveDraftPayload): Promise<{ providerDraftId: string }>;
  archiveEmails(providerThreadIds: string[]): Promise<{ previousArchived: Record<string, boolean> }>;
  unarchiveEmails(providerThreadIds: string[]): Promise<void>;
  labelEmails(
    providerThreadIds: string[],
    addLabels: string[],
    removeLabels: string[]
  ): Promise<LabelChangeResult>;
  snoozeEmails(providerThreadIds: string[], until: string): Promise<{ previousSnoozeUntil: Record<string, string | null> }>;
}

export interface CalendarProvider {
  readonly kind: "google" | "microsoft" | "mock";
  createEvent(payload: CreateEventPayload): Promise<{ providerEventId: string }>;
  deleteEvent(providerEventId: string): Promise<void>;
}
