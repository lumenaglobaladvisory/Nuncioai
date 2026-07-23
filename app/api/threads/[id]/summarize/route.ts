import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getLLMService } from "@/lib/llm";
import { threadWithMessagesToProviderThread } from "@/lib/triage";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (user) => {
    const thread = await prisma.emailThread.findFirst({
      where: { id, connectedAccount: { userId: user.id } },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    });
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const providerThread = threadWithMessagesToProviderThread(thread, thread.messages);
    const summary = await getLLMService().summarizeThread(providerThread);

    const updated = await prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        blufSummary: summary.bluf,
        decisions: JSON.stringify(summary.decisions),
        openQuestions: JSON.stringify(summary.openQuestions),
        actionItems: JSON.stringify(summary.actionItems),
        summarizedAt: new Date(),
      },
    });
    return NextResponse.json(updated);
  });
}
