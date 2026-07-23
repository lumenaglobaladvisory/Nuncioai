import type { ProviderMessage, ProviderThread } from "@/lib/providers/types";
import type { DraftRequest, DraftResult, ExtractionResult, LLMService, ThreadSummary, TriageResult } from "./types";

// Deterministic, rule-based fallback used when ANTHROPIC_API_KEY isn't set.
// Intentionally conservative: it never fabricates dates, prices, or
// commitments. It exists so the full app loop (triage -> summarize -> draft
// -> plan -> execute/undo) is exercisable without a live LLM.

const NOTIFICATION_RE = /no-?reply|notification|alerts?@|do-?not-?reply/i;
const NEWSLETTER_RE = /unsubscribe|newsletter|view in browser/i;
const URGENT_RE = /\burgent\b|\basap\b|\bdeadline\b|\beod\b|end of day|right away/i;
const ASK_RE = /\bplease\b|\bcould you\b|\bcan you\b|\blet me know\b|\bconfirm\b|\breview\b|\bapprove\b|\?\s*$/im;

function lastInbound(thread: ProviderThread): ProviderMessage | undefined {
  return [...thread.messages].reverse().find((m) => m.direction === "inbound");
}

function firstName(msg?: ProviderMessage): string {
  const name = msg?.fromName?.trim();
  if (name) return name.split(/\s+/)[0];
  return "there";
}

function sentencesWithQuestions(thread: ProviderThread, limit = 5): string[] {
  const sentences = thread.messages
    .flatMap((m) => m.bodyText.split(/(?<=[.?!])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?") && s.length > 8);
  return Array.from(new Set(sentences)).slice(0, limit);
}

function requestedActionSentences(thread: ProviderThread, limit = 5): string[] {
  const inbound = thread.messages.filter((m) => m.direction === "inbound");
  const sentences = inbound
    .flatMap((m) => m.bodyText.split(/(?<=[.?!])\s+/))
    .map((s) => s.trim())
    .filter((s) => ASK_RE.test(s) && s.length > 8);
  return Array.from(new Set(sentences)).slice(0, limit);
}

export const stubService: LLMService = {
  mode: "stub",

  async classifyThread(thread, _myEmail): Promise<TriageResult> {
    const last = lastInbound(thread);
    if (!last) {
      return { category: "reference", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
    }
    if (NOTIFICATION_RE.test(last.fromEmail)) {
      return { category: "notification", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
    }
    if (NEWSLETTER_RE.test(last.subject) || NEWSLETTER_RE.test(last.bodyText)) {
      return { category: "newsletter", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
    }

    const requestedActions = requestedActionSentences(thread);
    const isUrgent = URGENT_RE.test(last.subject) || URGENT_RE.test(last.bodyText);

    if (requestedActions.length > 0 || last.bodyText.includes("?")) {
      const priority = isUrgent ? "high" : requestedActions.length > 1 ? "medium" : "medium";
      const priorityReasons = [
        isUrgent ? "Message contains urgency language (urgent/asap/deadline)." : "Sender is asking a direct question or requesting action.",
      ];
      return {
        category: "must_respond",
        priority,
        priorityReasons,
        deadline: null,
        requestedActions,
      };
    }

    if (last.bodyText.trim().length < 400) {
      return {
        category: "needs_review",
        priority: "low",
        priorityReasons: ["Short message without an explicit question or request."],
        deadline: null,
        requestedActions: [],
      };
    }

    return { category: "low_value", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
  },

  async summarizeThread(thread): Promise<ThreadSummary> {
    const last = lastInbound(thread) ?? thread.messages[thread.messages.length - 1];
    const blufSource = (last?.bodyText ?? thread.snippet ?? "").trim().replace(/\s+/g, " ");
    return {
      bluf: blufSource.length > 240 ? `${blufSource.slice(0, 237)}...` : blufSource || "No message content available.",
      decisions: [],
      openQuestions: sentencesWithQuestions(thread),
      actionItems: requestedActionSentences(thread).map((action) => ({ owner: "you", action, dueDate: null })),
    };
  },

  async draftReply(request: DraftRequest): Promise<DraftResult> {
    const last = lastInbound(request.thread);
    const name = firstName(last);
    const subject = request.thread.subject.toLowerCase().startsWith("re:")
      ? request.thread.subject
      : `Re: ${request.thread.subject}`;
    const bodyText = [
      `Hi ${name},`,
      "",
      "Thanks for your note — acknowledging this so it doesn't slip through the cracks.",
      "[STUB DRAFT: no ANTHROPIC_API_KEY configured, so this is a generic placeholder. Please edit before sending.]",
      request.instructions ? `Notes for this reply: ${request.instructions}` : undefined,
      "",
      "Best,",
      "Me",
    ]
      .filter((l) => l !== undefined)
      .join("\n");
    return { subject, bodyText };
  },

  async draftFollowup(thread, tone): Promise<DraftResult> {
    const name = firstName(lastInbound(thread));
    const subject = thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`;
    const bodyText = [
      `Hi ${name || "there"},`,
      "",
      "Just following up on my note below — wanted to check if you had a chance to take a look.",
      "Happy to answer any questions.",
      `[STUB DRAFT, tone requested: ${tone}. No ANTHROPIC_API_KEY configured — please edit before sending.]`,
      "",
      "Best,",
      "Me",
    ].join("\n");
    return { subject, bodyText };
  },

  async extractTasksAndEvents(thread): Promise<ExtractionResult> {
    const actions = requestedActionSentences(thread, 3);
    return {
      tasks: actions.map((action) => ({
        title: action.length > 80 ? `${action.slice(0, 77)}...` : action,
        description: `From thread: ${thread.subject}`,
        dueDate: null,
        priority: "medium",
      })),
      events: [],
    };
  },
};
