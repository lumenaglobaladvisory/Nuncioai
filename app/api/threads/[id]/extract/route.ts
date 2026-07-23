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
    const extraction = await getLLMService().extractTasksAndEvents(providerThread);
    return NextResponse.json(extraction);
  });
}
