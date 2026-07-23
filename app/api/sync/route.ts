import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getEmailProvider } from "@/lib/providers";
import { getLLMService, isStubMode } from "@/lib/llm";
import { getTodayList } from "@/lib/triage";

export async function POST() {
  return withUser(async (user) => {
    const accounts = await prisma.connectedAccount.findMany({ where: { userId: user.id } });
    const llm = getLLMService();
    let threadsSynced = 0;
    let threadsClassified = 0;

    for (const account of accounts) {
      const provider = getEmailProvider(account);
      const providerThreads = await provider.fetchEmails({ maxResults: 50 });

      for (const pt of providerThreads) {
        const thread = await prisma.emailThread.upsert({
          where: {
            connectedAccountId_providerThreadId: {
              connectedAccountId: account.id,
              providerThreadId: pt.providerThreadId,
            },
          },
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
        threadsSynced++;

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

        if (!thread.category) {
          const triage = await llm.classifyThread(pt, account.email);
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
          threadsClassified++;
        }
      }
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
