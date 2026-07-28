import type { ProviderMessage, ProviderThread } from "@/lib/providers/types";
import type {
  DraftRequest,
  DraftResult,
  ExtractionResult,
  LLMService,
  ThreadSummary,
  ToneProfile,
  ToneSample,
  TriageResult,
} from "./types";

// Deterministic, rule-based fallback used when ANTHROPIC_API_KEY isn't set.
// Intentionally conservative: it never fabricates dates, prices, or
// commitments. It exists so the full app loop (triage -> summarize -> draft
// -> plan -> execute/undo) is exercisable without a live LLM.

// Sender/body signals for automated or bulk mail - checked first, since this
// is the biggest source of false positives for the categories below (a
// notification or newsletter can easily contain a stray "?" or the word
// "review" without being something a person needs to act on).
const SENDER_NOISE_RE = /no-?reply|do-?not-?reply|notification|alerts?@|digest@|updates?@|news@|mailer@|system@|\bbot@|automated/i;
const BODY_NOISE_RE = /unsubscribe|view in browser|manage (your )?(email )?preferences|update your (email )?preferences/i;

const URGENT_RE = /\burgent\b|\basap\b|\bdeadline\b|\beod\b|end of day|right away|by (today|tomorrow|tonight|end of week|eow)\b|time.?sensitive|immediately/i;
// Direct, specific asks - phrases a person uses when they actually want
// something from the recipient, as opposed to a generic sentence containing "?".
// "please [verb]" is deliberately a whitelist of actionable verbs, not any
// verb - "please visit our site" / "please see below" are generic marketing
// and boilerplate CTAs, not a personal ask, and would otherwise false-positive
// constantly on newsletters and security-tips mail.
const DIRECT_ASK_RE =
  /\b(could you|can you|would you|please (review|confirm|approve|sign|send|provide|complete|submit|respond|reply|call|schedule|forward|share|upload|finalize|advise|check|fill out|get back)|let me know|need (your|you to)|requires? your|waiting on you|your (approval|input|sign-?off|feedback|thoughts)|confirm|approve)\b/i;
const ASK_RE = /\bplease\b|\bcould you\b|\bcan you\b|\blet me know\b|\bconfirm\b|\breview\b|\bapprove\b|\?\s*$/im;

function isNoise(msg: ProviderMessage): boolean {
  return SENDER_NOISE_RE.test(msg.fromEmail) || BODY_NOISE_RE.test(msg.subject) || BODY_NOISE_RE.test(msg.bodyText);
}

// A "?" alone isn't enough signal (rhetorical questions in marketing copy,
// etc.) - require it to appear in a sentence that also addresses "you".
function hasDirectQuestionToRecipient(bodyText: string): boolean {
  const sentences = bodyText.split(/(?<=[.?!])\s+/).map((s) => s.trim());
  return sentences.some((s) => s.endsWith("?") && /\byou\b/i.test(s) && s.length > 8);
}

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
    const lastMessage = thread.messages[thread.messages.length - 1];
    if (!lastMessage || lastMessage.direction === "outbound") {
      // Nothing pending on your side right now: either the thread is empty,
      // or the most recent message is one you sent - you're waiting on them,
      // not the other way around. Judge this by the actual last message in
      // the thread, not just the last inbound one, so a thread you've
      // already replied to doesn't keep showing as needing a response.
      // Chasing an overdue reply is handled separately by the no_reply
      // policy trigger, not by Today triage.
      return { category: "fyi", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
    }

    const last = lastMessage;
    if (isNoise(last)) {
      return { category: "noise", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
    }

    const isDirectAsk = DIRECT_ASK_RE.test(last.bodyText) || hasDirectQuestionToRecipient(last.bodyText);
    if (!isDirectAsk) {
      return { category: "fyi", priority: null, priorityReasons: [], deadline: null, requestedActions: [] };
    }

    const requestedActions = requestedActionSentences(thread);
    const isUrgent = URGENT_RE.test(last.subject) || URGENT_RE.test(last.bodyText);
    const priority = requestedActions.length > 0 ? "medium" : "low";

    if (isUrgent) {
      return {
        category: "must_respond_today",
        priority: "high",
        priorityReasons: ["Direct request with same-day urgency language (urgent/asap/deadline/EOD)."],
        deadline: null,
        requestedActions,
      };
    }

    return {
      category: "review_this_week",
      priority,
      priorityReasons: ["Sender is asking a direct question or requesting something, no same-day urgency detected."],
      deadline: null,
      requestedActions,
    };
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

  async inferTone(samples: ToneSample[]): Promise<ToneProfile> {
    if (samples.length === 0) return { summary: "concise, professional, friendly" };

    const bodies = samples.map((s) => s.bodyText.trim());
    const sentenceCounts = bodies.map((b) => (b.match(/[.?!]+/g) ?? []).length || 1);
    const wordCounts = bodies.map((b) => b.split(/\s+/).filter(Boolean).length);
    const avgWordsPerSentence =
      wordCounts.reduce((a, b) => a + b, 0) / sentenceCounts.reduce((a, b) => a + b, 0);

    const greetings = bodies.map((b) => b.split("\n")[0]?.trim() ?? "");
    const usesHi = greetings.filter((g) => /^hi\b/i.test(g)).length;
    const usesHey = greetings.filter((g) => /^hey\b/i.test(g)).length;
    const usesDear = greetings.filter((g) => /^dear\b/i.test(g)).length;

    const SIGNOFFS = ["best", "thanks", "cheers", "regards", "best regards", "warmly", "talk soon"];
    const signoffCounts = new Map<string, number>();
    for (const body of bodies) {
      const lines = body
        .split("\n")
        .map((l) => l.trim().toLowerCase().replace(/[.,!]+$/, ""))
        .filter(Boolean);
      const match = lines.find((l) => SIGNOFFS.includes(l));
      if (match) signoffCounts.set(match, (signoffCounts.get(match) ?? 0) + 1);
    }
    const topSignoff = [...signoffCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const exclaimCount = bodies.reduce((sum, b) => sum + (b.match(/!/g) ?? []).length, 0);
    const upbeat = exclaimCount / samples.length > 0.5;

    const formality = usesDear > usesHi + usesHey ? "formal" : "casual";
    const greeting = usesHey >= usesHi ? "Hey" : "Hi";
    const conciseness = avgWordsPerSentence < 14 ? "concise, short sentences" : "detailed, fuller paragraphs";

    const parts = [
      conciseness,
      formality === "formal" ? `formal greetings ("Dear ...")` : `casual greetings ("${greeting} ...")`,
      upbeat ? "upbeat tone" : "measured, even-keeled tone",
      topSignoff ? `signs off with "${topSignoff.charAt(0).toUpperCase()}${topSignoff.slice(1)},"` : undefined,
    ].filter((p): p is string => Boolean(p));

    return { summary: parts.join(", ") };
  },
};
