import { z } from "zod";
import type { ProviderThread } from "@/lib/providers/types";

export const TRIAGE_CATEGORIES = [
  "must_respond",
  "needs_review",
  "low_value",
  "notification",
  "newsletter",
  "reference",
] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const triageResultSchema = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  priority: z.enum(PRIORITIES).nullable(),
  priorityReasons: z.array(z.string()).default([]),
  deadline: z.string().nullable().default(null),
  requestedActions: z.array(z.string()).default([]),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

export const threadSummarySchema = z.object({
  bluf: z.string(),
  decisions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  actionItems: z
    .array(z.object({ owner: z.string(), action: z.string(), dueDate: z.string().nullable().default(null) }))
    .default([]),
});
export type ThreadSummary = z.infer<typeof threadSummarySchema>;

export const draftResultSchema = z.object({
  subject: z.string(),
  bodyText: z.string(),
});
export type DraftResult = z.infer<typeof draftResultSchema>;

export const extractionResultSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().nullable().default(null),
        dueDate: z.string().nullable().default(null),
        priority: z.enum(PRIORITIES).default("medium"),
      })
    )
    .default([]),
  events: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().nullable().default(null),
        startTime: z.string(),
        endTime: z.string(),
        location: z.string().nullable().default(null),
      })
    )
    .default([]),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const toneProfileSchema = z.object({
  summary: z.string(),
});
export type ToneProfile = z.infer<typeof toneProfileSchema>;

export interface DraftRequest {
  thread: ProviderThread;
  tone?: string;
  instructions?: string;
  recipientMemory?: string;
}

export interface ToneSample {
  subject: string;
  bodyText: string;
}

export interface LLMService {
  readonly mode: "claude" | "stub";
  classifyThread(thread: ProviderThread, myEmail: string): Promise<TriageResult>;
  summarizeThread(thread: ProviderThread): Promise<ThreadSummary>;
  draftReply(request: DraftRequest): Promise<DraftResult>;
  draftFollowup(thread: ProviderThread, tone: string): Promise<DraftResult>;
  extractTasksAndEvents(thread: ProviderThread): Promise<ExtractionResult>;
  inferTone(samples: ToneSample[]): Promise<ToneProfile>;
}
