import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getEmailProvider } from "@/lib/providers";
import { getLLMService, isStubMode } from "@/lib/llm";
import { getTodayList } from "@/lib/triage";
import { mapWithConcurrency } from "@/lib/concurrency";
import { getPastMeetingAttendees, syncCalendarForAccount, threadHasStaleMeetingContext } from "@/lib/calendar-sync";

// How many threads to pull per connected account per sync. Paginated at the
// provider level (see lib/providers/gmail.ts, outlook.ts) so this can be
// raised without a single oversized API call; classification below is
// concurrency-limited so a larger cap doesn't blow Vercel's function timeout.
const SYNC_MAX_THREADS = 250;
const CLASSIFY_CONCURRENCY = 8;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const force = Boolean((body as { force?: boolean })?.force);

  return withUser(async (user) => {
    const accounts = await prisma.connectedAccount.findMany({ where: { userId: user.id } });
    const llm = getLLMService();
    let threadsSynced = 0;
    let threadsClassified = 0;

    // Calendar sync failing (e.g. Calendar API not enabled, missing scope)
    // shouldn't take down email sync - it's a best-effort enrichment step.
    for (const account of accounts) {
      try {
        await syncCalendarForAccount(account);
      } catch (err) {
        console.error(`Calendar sync failed for account ${account.id}:`, err);
      }
    }
    const pastMeetingAttendees = await getPastMeetingAttendees(user.id);

    for (const account of accounts) {
      const provider = getEmailProvider(account);
      const providerThreads = await provider.fetchEmails({ maxResults: SYNC_MAX_THREADS });

      const upserted = await mapWithConcurrency(providerThreads, CLASSIFY_CONCURRENCY, async (pt) => {
        const where = {
          connectedAccountId_providerThreadId: {
            connectedAccountId: account.id,
            providerThreadId: pt.providerThreadId,
          },
        };
        // Captured before the upsert so we can tell whether this sync brought
        // new activity (e.g. a reply, ours or theirs) that invalidates the
        // thread's existing classification.
        const existing = await prisma.emailThread.findUnique({
          where,
          select: { category: true, lastMessageAt: true },
        });

        const thread = await prisma.emailThread.upsert({
          where,
          create: {
            connectedAccountId: account.id,
            providerThreadId: pt.providerThreadId,
            subject: pt.subject,
            participants: JSON.stringify(pt.participants),
            snippet: pt.snippet,
            lastMessageAt: new Date(pt.lastMessageAt),
            labels: JSON.stringify(pt.labels),
          },
          update: {
            subject: pt.subject,
            participants: JSON.stringify(pt.participants),
            snippet: pt.snippet,
            lastMessageAt: new Date(pt.lastMessageAt),
            labels: JSON.stringify(pt.labels),
          },
        });

        await prisma.emailMessage.deleteMany({ where: { threadId: thread.id } });
        await prisma.emailMessage.createMany({
          data: pt.messages.map((m) => ({
            threadId: thread.id,
            providerMessageId: m.providerMessageId,
            fromName: m.fromName,
            fromEmail: m.fromEmail,
            toEmails: JSON.stringify(m.toEmails),
            ccEmails: m.ccEmails ? JSON.stringify(m.ccEmails) : null,
            subject: m.subject,
            bodyText: m.bodyText,
            bodyHtml: m.bodyHtml,
            sentAt: new Date(m.sentAt),
            direction: m.direction,
          })),
        });

        const hasNewActivity = !existing || new Date(pt.lastMessageAt).getTime() > existing.lastMessageAt.getTime();
        const needsClassification = force || !existing?.category || hasNewActivity;
        return { thread, pt, needsClassification };
      });
      threadsSynced += upserted.length;

      const toClassify = upserted.filter((u) => u.needsClassification);
      await mapWithConcurrency(toClassify, CLASSIFY_CONCURRENCY, async ({ thread, pt }) => {
        const triage = await llm.classifyThread(pt, account.email);

        // A thread whose participants already met with the user on a real,
        // now-past calendar event is very likely stale - the meeting it was
        // about has already happened, so treating it as urgent "respond
        // today" is usually wrong even if the message text still reads that
        // way (recurring automated reminders, pre-call notes, etc.).
        if (
          triage.category === "must_respond_today" &&
          threadHasStaleMeetingContext(pt.participants.map((p) => p.email), pastMeetingAttendees)
        ) {
          triage.category = "review_this_week";
          triage.priority = "medium";
          triage.priorityReasons = [
            ...triage.priorityReasons,
            "Downgraded: participants already met on a calendar event that has since ended.",
          ];
        }

        await prisma.emailThread.update({
          where: { id: thread.id },
          data: {
            category: triage.category,
            priority: triage.priority,
            priorityReasons: JSON.stringify(triage.priorityReasons),
            deadline: triage.deadline ? new Date(triage.deadline) : null,
            requestedActions: JSON.stringify(triage.requestedActions),
          },
        });
      });
      threadsClassified += toClassify.length;
    }

    const today = await getTodayList(user.id);
    return NextResponse.json({
      accountsSynced: accounts.length,
      threadsSynced,
      threadsClassified,
      llmMode: isStubMode() ? "stub" : "claude",
      today: today.map(({ thread, reason }) => ({ ...thread, reason })),
    });
  });
}
