import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/api-utils";
import { getLLMService } from "@/lib/llm";
import { threadWithMessagesToProviderThread } from "@/lib/triage";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    const thread = await prisma.emailThread.findFirst({
      where: { id, connectedAccount: { userId: user.id } },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    });
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const providerThread = threadWithMessagesToProviderThread(thread, thread.messages);
    const lastInbound = [...thread.messages].reverse().find((m) => m.direction === "inbound");

    let recipientMemory: string | undefined;
    if (lastInbound) {
      const memory = await prisma.memoryEntry.findUnique({
        where: { userId_scope_key: { userId: user.id, scope: "recipient", key: lastInbound.fromEmail } },
      });
      if (memory) recipientMemory = memory.data;
    }

    const draft = await getLLMService().draftReply({
      thread: providerThread,
      tone: body.tone ?? user.tonePreference ?? undefined,
      instructions: body.instructions,
      recipientMemory,
    });
    return NextResponse.json(draft);
  });
}
