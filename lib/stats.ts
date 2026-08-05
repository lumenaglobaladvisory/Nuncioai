import { prisma } from "@/lib/prisma";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Rough, documented time-savings assumptions used only to give the user a
// directional "this is working" number - not billed/marketed as precise.
// Each is the time a person would otherwise spend doing this by hand.
const MINUTES_PER_NOISE_EMAIL = 0.5; // glancing at / deleting a notification or newsletter
const MINUTES_PER_AUTOMATED_FOLLOWUP = 3; // drafting and sending a check-in manually
const MINUTES_PER_EXTRACTED_ITEM = 1; // manually re-typing a task/event from an email

export interface WeeklyImpact {
  threadsTriaged: number;
  noiseFiltered: number;
  needsAttention: number;
  followupsSent: number;
  tasksAndEventsExtracted: number;
  minutesSaved: number;
}

export async function getWeeklyImpact(userId: string): Promise<WeeklyImpact> {
  const since = new Date(Date.now() - WEEK_MS);

  const [threads, followupsSent, tasksCreated, eventsCreated] = await Promise.all([
    prisma.emailThread.findMany({
      where: { connectedAccount: { userId }, createdAt: { gte: since } },
      select: { category: true },
    }),
    prisma.planAction.count({
      where: {
        tool: "send_email",
        status: "executed",
        executedAt: { gte: since },
        plan: { userId, sourcePolicyId: { not: null } },
      },
    }),
    prisma.task.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.calendarEvent.count({ where: { userId, createdAt: { gte: since } } }),
  ]);

  const noiseFiltered = threads.filter((t) => t.category === "noise").length;
  const needsAttention = threads.filter(
    (t) => t.category === "must_respond_today" || t.category === "review_this_week"
  ).length;
  const tasksAndEventsExtracted = tasksCreated + eventsCreated;

  const minutesSaved = Math.round(
    noiseFiltered * MINUTES_PER_NOISE_EMAIL +
      followupsSent * MINUTES_PER_AUTOMATED_FOLLOWUP +
      tasksAndEventsExtracted * MINUTES_PER_EXTRACTED_ITEM
  );

  return { threadsTriaged: threads.length, noiseFiltered, needsAttention, followupsSent, tasksAndEventsExtracted, minutesSaved };
}

export interface DigestItem {
  id: string;
  subject: string;
  snippet: string | null;
  fromLabel: string;
  lastMessageAt: Date;
  isArchived: boolean;
  category: string | null;
}

export interface WeeklyDigest {
  noise: DigestItem[];
  fyi: DigestItem[];
}

function toDigestItem(thread: {
  id: string;
  subject: string;
  snippet: string | null;
  participants: string;
  lastMessageAt: Date;
  isArchived: boolean;
  category: string | null;
}): DigestItem {
  let fromLabel = "";
  try {
    const participants: { name?: string; email: string }[] = JSON.parse(thread.participants);
    fromLabel = participants[0]?.name || participants[0]?.email || "";
  } catch {
    fromLabel = "";
  }
  return {
    id: thread.id,
    subject: thread.subject,
    snippet: thread.snippet,
    fromLabel,
    lastMessageAt: thread.lastMessageAt,
    isArchived: thread.isArchived,
    category: thread.category,
  };
}

/** Newsletters, notifications, and other low-value mail from the last 7 days, batched for a quick skim instead of one-by-one. */
export async function getWeeklyDigest(userId: string): Promise<WeeklyDigest> {
  const since = new Date(Date.now() - WEEK_MS);
  const [noiseThreads, fyiThreads] = await Promise.all([
    prisma.emailThread.findMany({
      where: { connectedAccount: { userId }, category: "noise", lastMessageAt: { gte: since } },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    }),
    prisma.emailThread.findMany({
      where: { connectedAccount: { userId }, category: "fyi", lastMessageAt: { gte: since } },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    }),
  ]);

  return { noise: noiseThreads.map(toDigestItem), fyi: fyiThreads.map(toDigestItem) };
}
