import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { ProviderThread } from "@/lib/providers/types";
import {
  draftResultSchema,
  extractionResultSchema,
  threadSummarySchema,
  toneProfileSchema,
  triageResultSchema,
  type DraftRequest,
  type LLMService,
  type ToneSample,
} from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function threadToTranscript(thread: ProviderThread): string {
  return thread.messages
    .map(
      (m) =>
        `[${m.direction}] From: ${m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail} | Sent: ${m.sentAt}\nSubject: ${m.subject}\n${m.bodyText}`
    )
    .join("\n\n---\n\n");
}

async function callJSON<S extends z.ZodTypeAny>(system: string, user: string, schema: S): Promise<z.infer<S>> {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude response contained no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return schema.parse(parsed);
}

const TRIAGE_SYSTEM = `You are InboxPilot's triage engine. Classify a single email thread for a busy client-facing professional (consultant/agency/sales/operator).

Categories (pick exactly one): must_respond, needs_review, low_value, notification, newsletter, reference.
Priority (only for must_respond/needs_review; null otherwise): high, medium, low - based on relationship (client/boss/colleague/unknown), explicit deadlines, and impact on revenue/project timelines/obligations.

Respond with ONLY a JSON object matching this shape, no prose:
{"category": "...", "priority": "high"|"medium"|"low"|null, "priorityReasons": ["..."], "deadline": "ISO date or null", "requestedActions": ["..."]}`;

const SUMMARY_SYSTEM = `You are InboxPilot's thread summarizer. Given an email thread transcript, produce:
- bluf: a 1-3 sentence bottom-line-up-front summary
- decisions: key decisions/commitments already made in the thread
- openQuestions: unresolved questions
- actionItems: who owes what, and by when (owner, action, dueDate ISO or null)

Respond with ONLY JSON: {"bluf": "...", "decisions": ["..."], "openQuestions": ["..."], "actionItems": [{"owner": "...", "action": "...", "dueDate": "..." | null}]}`;

const DRAFT_SYSTEM = `You are InboxPilot, drafting an email reply on behalf of the user. Match the requested tone (default: concise, clear, professional, friendly). Use the thread context and any per-recipient memory provided. Do not fabricate facts, prices, or commitments not present in the thread or instructions. If a decision is genuinely required from the user (e.g. offering a discount), leave a clearly marked placeholder like [YOUR DECISION: ...] rather than inventing one.

Respond with ONLY JSON: {"subject": "...", "bodyText": "..."}`;

const FOLLOWUP_SYSTEM = `You are InboxPilot, drafting a follow-up email because the recipient hasn't replied to a prior message in this thread. Match the requested tone. Keep it brief, reference the original ask once, and make it easy to respond.

Respond with ONLY JSON: {"subject": "...", "bodyText": "..."}`;

const EXTRACTION_SYSTEM = `You are InboxPilot's task/event extractor. Given an email thread, identify concrete tasks (e.g. "send deck", "review contract") and calendar-worthy events (scheduled meetings, deadlines, milestones with a specific time). Only extract items with reasonable confidence; return empty arrays if none.

Respond with ONLY JSON: {"tasks": [{"title": "...", "description": "..."|null, "dueDate": "ISO"|null, "priority": "high"|"medium"|"low"}], "events": [{"title": "...", "description": "..."|null, "startTime": "ISO", "endTime": "ISO", "location": "..."|null}]}`;

const TONE_SYSTEM = `You are analyzing a professional's own past sent emails to describe their writing tone and style in one or two sentences, written as an instruction an AI assistant could follow when drafting replies on their behalf (e.g. "concise and warm, short paragraphs, signs off with 'Best,', avoids exclamation points"). Base this only on patterns actually present in the samples - don't invent traits you can't observe. If the samples are too sparse or inconsistent to say anything confident, default to "concise, professional, friendly".

Respond with ONLY JSON: {"summary": "..."}`;

export const claudeService: LLMService = {
  mode: "claude",

  async classifyThread(thread, myEmail) {
    const user = `My email address is ${myEmail}.\n\nThread:\n${threadToTranscript(thread)}`;
    return callJSON(TRIAGE_SYSTEM, user, triageResultSchema);
  },

  async summarizeThread(thread) {
    const user = `Thread:\n${threadToTranscript(thread)}`;
    return callJSON(SUMMARY_SYSTEM, user, threadSummarySchema);
  },

  async draftReply(request: DraftRequest) {
    const user = [
      `Thread:\n${threadToTranscript(request.thread)}`,
      request.tone ? `Requested tone: ${request.tone}` : undefined,
      request.instructions ? `Additional instructions from the user: ${request.instructions}` : undefined,
      request.recipientMemory ? `Known context about this recipient: ${request.recipientMemory}` : undefined,
    ]
      .filter(Boolean)
      .join("\n\n");
    return callJSON(DRAFT_SYSTEM, user, draftResultSchema);
  },

  async draftFollowup(thread, tone) {
    const user = `Requested tone: ${tone}\n\nThread:\n${threadToTranscript(thread)}`;
    return callJSON(FOLLOWUP_SYSTEM, user, draftResultSchema);
  },

  async extractTasksAndEvents(thread) {
    const user = `Thread:\n${threadToTranscript(thread)}`;
    return callJSON(EXTRACTION_SYSTEM, user, extractionResultSchema);
  },

  async inferTone(samples: ToneSample[]) {
    if (samples.length === 0) return { summary: "concise, professional, friendly" };
    const user = samples.map((m, i) => `Email ${i + 1} - Subject: ${m.subject}\n${m.bodyText}`).join("\n\n---\n\n");
    return callJSON(TONE_SYSTEM, user, toneProfileSchema);
  },
};
